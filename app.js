// Drekka: find the most unique drink at a place, and keep a journal of drinks you try.
// Screens: search -> picks -> (optional) journal page. Everything is saved on this device only.
import { readMenu } from "./ai.js";
import { fetchMenuText } from "./menu.js";
import { pickThree, flavorChips, favoriteHere } from "./picks.js";
import { sound, isMuted } from "./sound.js";
import { runQuiz, profileFrom, summary } from "./quiz.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- Saved data (this device only) ----------
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const journal = () => store.get("drekka-journal", []);
const aiKey = () => store.get("drekka-key", "");
const me = () => store.get("drekka-me", null); // answers from the welcome quiz
const today = () => new Date().toISOString().slice(0, 10);

function toast(text) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

function show(view) {
  for (const v of ["search-view", "picks-view", "journal-view"]) $(v).hidden = v !== view;
  window.scrollTo(0, 0);
}

// Every tap wakes the sound (browsers need a tap before audio can play).
document.addEventListener("pointerdown", () => sound.wake(), { capture: true });

// ---------- Sound button ----------
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
const drawSpeaker = () => ($("sound-btn").innerHTML = isMuted() ? SPEAKER_OFF : SPEAKER_ON);
$("sound-btn").onclick = () => { const m = sound.toggle(); drawSpeaker(); toast(m ? "sound off" : "sound on"); };
drawSpeaker();

// ---------- 1. Search for a place (free OpenStreetMap search, no key needed) ----------
let searchTimer;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("search").value.trim();
  if (q.length < 2) { $("results").innerHTML = ""; return; }
  searchTimer = setTimeout(() => findPlaces(q), 350);
});

async function findPlaces(q) {
  let rows = "";
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7`);
    const data = await res.json();
    rows = data.features.map(({ properties: p }) => {
      const addr = [[p.housenumber, p.street].filter(Boolean).join(" "), p.city || p.town || p.village, p.state, p.country].filter(Boolean).join(", ");
      return p.name ? `<li><button data-name="${esc(p.name)}" data-addr="${esc(addr)}" data-osm="${esc(p.osm_type + p.osm_id)}"><b>${esc(p.name)}</b><span>${esc(addr)}</span></button></li>` : "";
    }).join("");
  } catch { /* offline or search down */ }
  if ($("search").value.trim() === q) $("results").innerHTML = rows || `<li class="none">can't find that spot on the map. try adding the city, like “yi fang tempe”.</li>`;
}

$("results").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  sound.tap();
  openPlace({ name: b.dataset.name, address: b.dataset.addr, osm: b.dataset.osm });
});

// ---------- 2. Picks ----------
let place = null, menu = null, chosen = [], shown = [];

async function openPlace(p) {
  place = p; menu = null; chosen = []; shown = [];
  show("picks-view");
  $("place-name").textContent = p.name;
  $("place-addr").textContent = p.address || "";
  $("cards").innerHTML = ""; $("after-picks").hidden = true;

  const fav = favoriteHere(journal(), p.name);
  $("favorite").hidden = !fav;
  if (fav) $("favorite").textContent = `last time you loved the ${fav.drinkName} here (${fav.rating}/10). want it again?`;

  if (!aiKey()) {
    $("status").textContent = "first, add your free ai key in settings so i can read menus.";
    $("settings").showModal();
    return;
  }
  // Each place's menu is saved for the day, so coming back doesn't use up free AI searches.
  const cacheKey = `drekka-menu:${p.name}|${p.address}`.toLowerCase();
  const cached = store.get(cacheKey, null);
  if (cached && cached.day === today()) { menu = cached.menu; return showPicks(); }

  // Find their website, open the menu pages, then let the ai pick out the drinks.
  const say = (t) => { if (place === p) $("status").innerHTML = `<span class="dots-loading">${t}</span>`; };
  say("finding their menu");
  const slow = setTimeout(() => say("still reading, some menus take a little while"), 12000);
  try {
    const got = await fetchMenuText(p);
    if (!got) { clearTimeout(slow); if (place === p) $("status").textContent = "couldn't find this place's menu online. try another spot nearby."; return; }
    clearTimeout(slow);
    say("picking the rarest drinks");
    menu = await readMenu(aiKey(), p, got.pages);
  } catch (err) {
    clearTimeout(slow);
    if (place !== p) return;
    $("status").textContent = err.message;
    return;
  }
  clearTimeout(slow);
  if (place !== p) return; // they already moved on to another place
  if (!menu.found) {
    $("status").textContent = "found their website, but no drinks on it. try another spot nearby.";
    return;
  }
  store.set(cacheKey, { day: today(), menu });
  showPicks();
}

function showPicks() {
  const picks = pickThree(menu.drinks, journal(), place.name, chosen, shown, profileFrom(me()));
  if (!picks.length) {
    $("status").textContent = shown.length ? "that's every drink that fits. tap different flavors, or start over." : "no drinks match those flavors here.";
    $("cards").innerHTML = "";
  } else {
    $("status").textContent = "";
    shown.push(...picks.map((p) => p.drink.name));
    $("cards").innerHTML = picks.map(card).join("");
    sound.reveal();
  }
  $("after-picks").hidden = false;
  drawChips();
  const src = (menu.sources || []).map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || "menu")}</a>`).join(", ");
  $("menu-note").innerHTML = `${src ? `from ${src}. ` : ""}menus change, so ask if it's still available.`;
}

function card({ kind, label, drink: d }) {
  const dots = Array.from({ length: 10 }, (_, i) => `<i class="${i < d.uniqueness ? "on" : ""}"></i>`).join("");
  return `<article class="card">
    <p class="kind">${esc(label)}</p>
    <h3>${esc(d.name)}</h3>
    ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ""}
    ${d.why ? `<p class="why">${esc(d.why)}</p>` : ""}
    <div class="meta"><span class="rarity" title="uniqueness ${d.uniqueness} of 10">${dots}&nbsp;${d.uniqueness}/10 unique</span><span>${esc(d.price || "")}</span></div>
    <button class="ink-btn ghost have" data-drink="${esc(d.name)}">i'm having this · add to journal</button>
  </article>`;
}

$("cards").addEventListener("click", (e) => {
  const b = e.target.closest(".have");
  if (!b) return;
  const d = menu.drinks.find((x) => x.name === b.dataset.drink);
  openBook({ drinkName: d.name, flavors: d.flavors, uniqueness: d.uniqueness, placeName: place.name, placeAddr: place.address });
});

function drawChips() {
  $("chips").innerHTML = flavorChips(menu.drinks).map((f) =>
    `<button class="chip ${chosen.includes(f) ? "on" : ""}" data-f="${esc(f)}">${esc(f)}</button>`).join("");
}
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const f = b.dataset.f;
  chosen = chosen.includes(f) ? chosen.filter((x) => x !== f) : [...chosen, f];
  sound.chip(chosen.includes(f));
  shown = []; // new flavors = start fresh
  showPicks();
});
$("more-btn").onclick = () => { sound.tap(); showPicks(); };
$("back-btn").onclick = () => { place = null; show("search-view"); $("search").focus(); };

// Make a picture smaller so it saves and sends quickly. Returns a data URL.
// vintage = true gives it an old journal photo look: black and white, warm sepia, grain, dark corners.
function shrink(fileOrVideo, size, quality, vintage = false) {
  return new Promise((resolve) => {
    const draw = (src, w, h) => {
      const s = Math.min(1, size / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      const g = c.getContext("2d");
      if (vintage) g.filter = "grayscale(1) sepia(0.45) contrast(1.15) brightness(0.97)";
      g.drawImage(src, 0, 0, c.width, c.height);
      if (vintage) agePhoto(g, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    if (fileOrVideo instanceof HTMLVideoElement) return draw(fileOrVideo, fileOrVideo.videoWidth, fileOrVideo.videoHeight);
    const img = new Image();
    img.onload = () => { draw(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(fileOrVideo);
  });
}

function agePhoto(g, w, h) {
  g.filter = "none";
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.72);
  v.addColorStop(0, "rgba(40,25,10,0)"); v.addColorStop(1, "rgba(40,25,10,0.55)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
}

// ---------- 3. The journal page (opens like a book) ----------
let draft = null, stream = null;

async function openBook(info) {
  draft = { ...info, rating: 0, photo: "" };
  $("e-name").value = info.drinkName || "";
  $("e-place").textContent = info.placeName ? `${info.placeName}${info.placeAddr ? " · " + info.placeAddr : ""}` : "";
  $("e-note").value = "";
  clearScribble(); drawDots();
  $("snap").hidden = true; $("sketch").hidden = true; $("cam").hidden = false;
  $("snap-btn").hidden = false; $("skip-btn").hidden = false; $("upload-btn").hidden = true;
  $("book").hidden = false;
  const book = $("book").querySelector(".book");
  book.classList.remove("open");
  requestAnimationFrame(() => requestAnimationFrame(() => book.classList.add("open")));
  sound.page();
  // The camera turns on by itself, small, inside the polaroid.
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 640, height: 640 }, audio: false });
    $("cam").srcObject = stream;
  } catch {
    $("cam").hidden = true; $("snap-btn").hidden = true; $("upload-btn").hidden = false; $("sketch").hidden = false;
  }
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; $("cam").srcObject = null;
}

function closeBook(after) {
  stopCamera();
  $("book").querySelector(".book").classList.remove("open");
  sound.page();
  setTimeout(() => { $("book").hidden = true; after && after(); }, 800);
}

function setPhoto(dataUrl) {
  draft.photo = dataUrl;
  $("snap").src = dataUrl; $("snap").hidden = false; $("cam").hidden = true; $("sketch").hidden = true;
  $("snap-btn").hidden = true; $("skip-btn").textContent = "retake"; $("skip-btn").hidden = false;
}

$("snap-btn").onclick = async () => {
  if (!stream) return;
  setPhoto(await shrink($("cam"), 360, 0.75, true));
  stopCamera(); sound.tap();
};
$("skip-btn").onclick = async () => {
  if (draft.photo) { // retake
    draft.photo = ""; $("skip-btn").textContent = "no photo";
    $("snap").hidden = true; return openCameraAgain();
  }
  stopCamera();
  $("cam").hidden = true; $("sketch").hidden = false; $("snap-btn").hidden = true; $("skip-btn").hidden = true;
};
async function openCameraAgain() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    $("cam").srcObject = stream; $("cam").hidden = false; $("snap-btn").hidden = false;
  } catch { $("sketch").hidden = false; $("upload-btn").hidden = false; }
}
$("upload").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) setPhoto(await shrink(f, 360, 0.75, true)); });

// Rating dots 1-10 (this is what Drekka learns your taste from)
function drawDots() {
  $("dots").innerHTML = Array.from({ length: 10 }, (_, i) => `<button class="${i < draft.rating ? "on" : ""}" data-n="${i + 1}">${i + 1}</button>`).join("");
}
$("dots").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  draft.rating = +b.dataset.n; drawDots(); sound.chip(true);
});

// Scribble pad: write "9/10", draw a heart, anything.
const pad = $("scribble"), pen = pad.getContext("2d");
let drawing = false, last = null, scribbled = false;
function clearScribble() { pen.clearRect(0, 0, pad.width, pad.height); scribbled = false; }
function padPoint(e) {
  const r = pad.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * pad.width, y: ((e.clientY - r.top) / r.height) * pad.height };
}
pad.addEventListener("pointerdown", (e) => { drawing = true; last = padPoint(e); pad.setPointerCapture(e.pointerId); });
pad.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = padPoint(e);
  pen.strokeStyle = "#2b1d12"; pen.lineWidth = 3; pen.lineCap = "round"; pen.lineJoin = "round";
  pen.beginPath(); pen.moveTo(last.x, last.y); pen.lineTo(p.x, p.y); pen.stroke();
  last = p; scribbled = true;
});
pad.addEventListener("pointerup", () => (drawing = false));
pad.addEventListener("pointercancel", () => (drawing = false));
$("clear-scribble").onclick = clearScribble;

$("book-close").onclick = () => closeBook();
$("save-entry").onclick = () => {
  const name = $("e-name").value.trim();
  if (!name) { $("e-name").focus(); return toast("give the drink a name first"); }
  if (!draft.rating) return toast("tap a number to rate it");
  const entry = {
    id: Date.now(), date: today(), drinkName: name,
    placeName: draft.placeName || "", placeAddr: draft.placeAddr || "",
    flavors: draft.flavors || [], uniqueness: draft.uniqueness || null,
    rating: draft.rating, note: $("e-note").value.trim(), photo: draft.photo,
    scribble: scribbled ? pad.toDataURL("image/png") : "",
  };
  if (!store.set("drekka-journal", [entry, ...journal()])) return toast("your phone is out of space for photos");
  sound.save();
  closeBook(() => { toast("cheers! saved to your journal"); if (!$("journal-view").hidden) drawJournal(); });
};

// ---------- Journal list ----------
// Drinks without a photo get the little ink drawing from the journal page.
const SKETCH = `<div class="sketch">${$("sketch").innerHTML}</div>`;
function drawJournal() {
  const list = journal();
  $("journal-count").textContent = list.length ? `${list.length} drink${list.length > 1 ? "s" : ""} tried so far` : "";
  $("entries").innerHTML = list.length ? list.map((e) => `
    <div class="entry">
      <div class="pic">${e.photo ? `<img src="${e.photo}" alt="">` : SKETCH}</div>
      <h4>${esc(e.drinkName)}</h4>
      <div class="where">${esc(e.placeName)}${e.placeName ? " · " : ""}${esc(e.date)}</div>
      ${e.scribble ? `<img class="scrib" src="${e.scribble}" alt="">` : ""}
      <div class="score">${e.rating}/10 <button class="link-btn del" data-id="${e.id}">remove</button></div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
    </div>`).join("") : `<p class="empty">your journal is empty. find a drink, then tap “add to journal”.</p>`;
}
$("entries").addEventListener("click", (e) => {
  const b = e.target.closest(".del");
  if (!b || !confirm("remove this drink from your journal?")) return;
  store.set("drekka-journal", journal().filter((x) => x.id !== +b.dataset.id));
  drawJournal();
});
$("journal-btn").onclick = () => { sound.page(); drawJournal(); show("journal-view"); };
$("journal-back").onclick = () => show(place ? "picks-view" : "search-view");
$("new-entry").onclick = () => openBook({ drinkName: "", placeName: "", placeAddr: "" });

// ---------- Settings ----------
$("settings-btn").onclick = () => {
  $("key-input").value = aiKey();
  $("me-summary").textContent = me() ? summary(me()) : "";
  $("settings").showModal();
};
$("retake-quiz").onclick = () => { $("settings").close(); startQuiz(); };

// ---------- Welcome quiz (first open, or from settings) ----------
function greet() {
  const name = me()?.name;
  $("search-view").querySelector("h2").textContent = name ? `where are you drinking today, ${name}?` : "where are you drinking today?";
}
function startQuiz() {
  runQuiz(sound, me(), (answers) => {
    if (answers) store.set("drekka-me", answers);
    store.set("drekka-welcomed", true);
    greet();
    if (!aiKey()) $("settings").showModal(); // one-time setup: the free ai key
  });
}
if (!store.get("drekka-welcomed", false)) startQuiz();
greet();
$("settings-close").onclick = () => $("settings").close();
$("key-save").onclick = () => {
  store.set("drekka-key", $("key-input").value.trim());
  $("settings").close(); toast("saved");
  if (place && !menu) openPlace(place);
};
$("clear-data").onclick = () => {
  if (!confirm("erase every drink in your journal on this device? this can't be undone.")) return;
  store.set("drekka-journal", []); drawJournal(); toast("journal erased");
};

// Works offline and installs like an app.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
