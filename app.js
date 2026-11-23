// Drekka: find the most unique drink at a place, and keep a journal of drinks you try.
// Screens: search -> picks -> (optional) journal page. Everything is saved on this device only.
import { celebrate } from "./celebrate.js";
import { track } from "./track.js";
import { readMenu, readRating } from "./ai.js";
import { API } from "./config.js";
import { fetchMenuText } from "./menu.js";
import { pickThree, flavorChips, favoriteHere, isAlcohol } from "./picks.js";
import { sound, isMuted, getVolume } from "./sound.js";
import { runQuiz, profileFrom, summary } from "./quiz.js";
import { runIntro } from "./intro.js";
import { brewing } from "./waiting.js";
import { LOOKS, applyLook, setLook, currentLook } from "./look.js";
import { runTour } from "./tour.js";

applyLook(); // the look you chose (paper, night, matcha...) before anything shows
import { KINDS, whereAmI, findNearby, chooseFor, howFar } from "./nearby.js";

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

function toast(text, ms = 2600) {
  const t = $("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), ms);
}

function show(view) {
  for (const v of ["search-view", "picks-view", "journal-view"]) $(v).hidden = v !== view;
  window.scrollTo(0, 0);
}

// Every tap wakes the sound (browsers, especially on iphone, need a tap before audio can play).
for (const ev of ["pointerdown", "touchend", "click"]) document.addEventListener(ev, () => sound.wake(), { capture: true });

// ---------- Menus: from drekka's server, or (testing) with your own keys ----------
const placeKey = (p) => (p.osm || p.gid || `${p.name}|${p.address}`).toLowerCase();
const pending = new Map(); // lookups already started (so tapping a result reuses the head start)
// early = a head start while you're still on the search screen: free sources only, never the
// paid google search. If an early look finds nothing, tapping the place looks again with everything.
function askServer(p, early) {
  return fetch(API + "/menu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, early }) })
    .then((r) => r.json()).then((m) => { if (m.error) throw new Error(m.error); return { ...m, early }; });
}
function getMenu(p, early = false) {
  const k = placeKey(p);
  if (!pending.has(k)) {
    const job = API
      ? askServer(p, early)
      : fetchMenuText(p, { jinaKey: store.get("drekka-jina", "") })
          .then((got) => (got ? readMenu(aiKey(), p, got.pages) : { found: false, drinks: [] }));
    job.catch(() => pending.delete(k)); // a failed lookup can be tried again
    pending.set(k, job);
  }
  if (early) return pending.get(k);
  // A real tap: reuse the head start, unless it was a free-only look that came up empty.
  return pending.get(k).then((m) => (m.early && !m.found ? askServer(p, false) : m));
}

// ---------- Sound button ----------
const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
$("volume").value = Math.round(getVolume() * 100);
$("volume").oninput = () => sound.setVolume($("volume").value / 100);
const drawSpeaker = () => ($("sound-btn").innerHTML = isMuted() ? SPEAKER_OFF : SPEAKER_ON);
$("sound-btn").onclick = () => { const m = sound.toggle(); drawSpeaker(); if (m) toast("music off"); else soundHint(); };
drawSpeaker();

// iphones on silent mode don't play web music: a small note under the music button explains it.
// Shows once when the music first starts (each time the app opens), and when music is turned on.
const onIphone = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function soundHint() {
  if (!onIphone || isMuted()) return;
  $("sound-hint").hidden = false;
  clearTimeout(soundHint.t); soundHint.t = setTimeout(() => ($("sound-hint").hidden = true), 5000);
}
document.addEventListener("pointerdown", () => soundHint(), { once: true });
$("sound-hint").onclick = () => ($("sound-hint").hidden = true);

// ---------- 1. Search for a place (free OpenStreetMap search, no key needed) ----------
let searchTimer;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("search").value.trim();
  if (q.length < 2) { $("results").innerHTML = ""; return; }
  searchTimer = setTimeout(() => findPlaces(q), 350);
});

// Roughly where you are (city level, from the server; no permission pop-up), so nearby places
// come first: "casa" finds the bar in tempe, not casa grande.
let near = null;
if (API) fetch(API + "/where", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
  .then((r) => r.json()).then((w) => { if (w.lat && w.lon) near = w; }).catch(() => {});

async function findPlaces(q) {
  let rows = "";
  const generic = !!kindFromWord(q); // "cafe", "bar"...: no menu head starts or google searches for that
  try {
    const bias = near ? `&lat=${near.lat}&lon=${near.lon}` : "";
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=15${bias}`);
    const data = await res.json();
    // Only real places (cafés, bars, shops...), not streets, freeways or neighborhoods.
    data.features = data.features.filter((f) => /^(amenity|shop|craft|tourism|leisure)$/.test(f.properties.osm_key)).slice(0, 7);
    rows = data.features.map(({ properties: p }) => {
      const addr = [[p.housenumber, p.street].filter(Boolean).join(" "), p.city || p.town || p.village, p.state, p.country].filter(Boolean).join(", ");
      return p.name ? `<li><button data-name="${esc(p.name)}" data-addr="${esc(addr)}" data-osm="${esc(p.osm_type + p.osm_id)}"><b>${esc(p.name)}</b><span>${esc(addr)}</span></button></li>` : "";
    }).join("");
    // Does any map result actually carry the name you typed? ("honey to a bee" vs "killer bee honey": no)
    mapHasIt = data.features.some((f) => f.properties.name && sameName(f.properties.name, q));
    // Start reading the top result's menu right away, so it's (nearly) ready when it's tapped.
    const top = data.features.find((f) => f.properties.name)?.properties;
    if (API && top && mapHasIt && !generic && $("search").value.trim() === q) {
      const addr = [[top.housenumber, top.street].filter(Boolean).join(" "), top.city || top.town || top.village, top.state, top.country].filter(Boolean).join(", ");
      getMenu({ name: top.name, address: addr, osm: top.osm_type + top.osm_id }, true).catch(() => {});
    }
  } catch { /* offline or search down */ }
  if ($("search").value.trim() !== q) return; // they kept typing
  // The map doesn't know every place (new or small spots are often missing). Then google maps is
  // asked too (free up to a monthly limit, on the server), and its matches go on top.
  let gRows = "", gTop = null;
  if (API && !mapHasIt && !generic && q.length >= 3) {
    try {
      const res = await fetch(API + "/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, lat: near?.lat, lon: near?.lon }) });
      const found = ((await res.json()).places || []).filter((g) => sameName(g.name, q)).slice(0, 4);
      gTop = found[0] || null;
      gRows = found.map((g) => `<li><button data-name="${esc(g.name)}" data-addr="${esc(g.address)}" data-osm="" data-gid="${esc(g.gid)}"><b>${esc(g.name)}</b><span>${esc(g.address)}</span></button></li>`).join("");
    } catch { /* server busy: the web search row still works */ }
    if ($("search").value.trim() !== q) return;
  }
  // You can always look a name up on the web instead. When nothing anywhere has that name, that row
  // goes on top and the web search starts by itself once you stop typing, so it's ready when you tap.
  const known = mapHasIt || gTop;
  const anyway = `<li><button class="anyway" data-name="${esc(q)}" data-addr="" data-osm=""><b>${known ? "not here? look up" : "search the web for"} “${esc(q)}”</b><span>${known ? "drekka will search the web for its menu" : "the map doesn't know it yet, so drekka is already looking online"}</span></button></li>`;
  // Typed a kind of place ("cafe", "boba", "bar") instead of a name? Offer to find one nearby.
  const kind = kindFromWord(q);
  const nearRow = kind ? `<li><button class="anyway near-row" data-near="${esc(kind.t)}"><b>looking for any ${esc(kind.t === "surprise me" ? "spot" : kind.t)} near you?</b><span>tap here and drekka will find one with you</span></button></li>` : "";
  $("results").innerHTML = nearRow + (mapHasIt ? rows + anyway : gTop ? gRows + rows + anyway : anyway + rows);
  if (API && !mapHasIt && !generic && (gTop || q.split(/\s+/).length >= 2)) {
    clearTimeout(webTimer);
    const head = gTop ? { name: gTop.name, address: gTop.address, osm: "", gid: gTop.gid } : { name: q, address: "", osm: "" };
    webTimer = setTimeout(() => { if ($("search").value.trim() === q) getMenu(head, true).catch(() => {}); }, gTop ? 300 : 1200);
  }
}
let mapHasIt = false, webTimer;
// Words that name a kind of place, not a place.
const KIND_WORDS = [
  [/^(cafe|café|cafes|coffee|coffee shop|coffeeshop)s?$/, "café"], [/^(boba|bubble tea|tea|tea shop|milk tea)$/, "boba & tea"],
  [/^(juice|smoothie|smoothies|juice bar)$/, "juice & smoothies"], [/^(dessert|ice cream|shake|shakes|milkshake)$/, "dessert & shakes"],
  [/^(bar|bars|pub|pubs|cocktail|cocktails|cocktail bar)$/, "bar"], [/^(brewery|breweries|beer|taproom|tap room)$/, "brewery"],
  [/^(restaurant|restaurants|food)$/, "restaurant"], [/^(anything|any|somewhere|drinks?|near me)$/, "surprise me"],
];
function kindFromWord(q) {
  const w = q.toLowerCase().trim().replace(/\s+near me$/, "").trim();
  const hit = KIND_WORDS.find(([re]) => re.test(w));
  return hit ? KINDS.find((k) => k.t === hit[1]) : null;
}
// Loose name match: "honey to a bee" ~ "Honey 2 A Bee", "swig" ~ "Swig Tempe".
const squashName = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(to|too|two)\b/g, "2").replace(/\b(for|four)\b/g, "4").replace(/\b(and|n|the)\b/g, " ").replace(/\s+/g, "");
function sameName(name, q) {
  const a = squashName(name), b = squashName(q);
  const head = squashName(q.trim().split(/\s+/).slice(0, -1).join(" ")); // "yi fang tempe" -> "yifang"
  return a.includes(b) || b.includes(a) || (head.length > 2 && a.startsWith(head));
}

$("results").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  sound.tap();
  if (b.dataset.near !== undefined) return openNearby(b.dataset.near);
  openPlace({ name: b.dataset.name, address: b.dataset.addr, osm: b.dataset.osm, gid: b.dataset.gid || "" });
});

// ---------- 1b. No place in mind: find one near you ----------
// Step 1: what kind of spot. Step 2: where you are (asks for location once). Step 3: a short list
// of real places nearby, plus "you choose for me".
$("near-btn").onclick = () => { sound.tap(); track("nearby-open"); openNearby(); };
$("near-close").onclick = () => $("nearby").close();
function openNearby(kindName) {
  if (!$("nearby").open) $("nearby").showModal();
  if (kindName) return nearList(KINDS.find((k) => k.t === kindName));
  $("near-body").innerHTML = `<h2 class="ink">what are you in the mood for?</h2>
    <p class="hand">pick a kind of spot, and drekka will look around you.</p>
    <div class="quiz-chips">${KINDS.map((k) => `<button class="chip big" data-k="${esc(k.t)}">${esc(k.t)}</button>`).join("")}</div>`;
}
$("near-body").addEventListener("click", (e) => {
  const k = e.target.closest("[data-k]"), p = e.target.closest("[data-pick]"), any = e.target.closest("#choose-for-me");
  if (k) { sound.chip(true); track("nearby", k.dataset.k); nearList(KINDS.find((x) => x.t === k.dataset.k)); }
  if (p) { sound.tap(); track("nearby-chose-place"); goTo(nearPlaces[+p.dataset.pick]); }
  if (any) { sound.reveal(); track("nearby-pick-for-me"); spin(); }
  if (e.target.closest("#near-again")) { sound.tap(); openNearby(); }
});
let nearPlaces = [], nearKind = "";
async function nearList(kind) {
  nearKind = kind.t;
  $("near-body").innerHTML = `<h2 class="ink">${esc(kind.t)} near you</h2>
    <p class="hand"><span class="dots-loading">looking around you</span></p>
    <p class="small">your phone may ask to share your location. drekka only uses it for this search and doesn't save it.</p>`;
  const at = await whereAmI(near);
  if (!$("nearby").open) return;
  if (!at) {
    track("nearby-no-location");
    $("near-body").innerHTML = `<h2 class="ink">i couldn't tell where you are</h2><p class="hand">allow location for drekka in your browser settings, or type the place's name instead.</p><button class="link-btn" id="near-again">← back</button>`;
    return;
  }
  try { nearPlaces = await findNearby(kind, at, API); }
  catch (err) { $("near-body").innerHTML = `<h2 class="ink">hmm</h2><p class="hand">${esc(err.message)}</p><button class="link-btn" id="near-again">← back</button>`; return; }
  if (!$("nearby").open) return;
  if (!nearPlaces.length) {
    track("nearby-none-found", kind.t);
    $("near-body").innerHTML = `<h2 class="ink">no ${esc(kind.t)} close by</h2><p class="hand">the map doesn't know one near you. try another kind of spot.</p><button class="link-btn" id="near-again">← pick another kind</button>`;
    return;
  }
  $("near-body").innerHTML = `<h2 class="ink">${esc(kind.t === "surprise me" ? "spots" : kind.t)} near you</h2>
    <button class="ink-btn" id="choose-for-me">just pick one for me</button>
    <ul class="results near-list">${nearPlaces.map((p, i) => `<li><button data-pick="${i}"><b>${esc(p.name)}</b><span>${p.rating ? `★ ${p.rating.toFixed(1)} (${p.reviews}) · ` : ""}${esc(howFar(p.km))} away${p.site ? "" : " · menu may be hard to find"}</span></button></li>`).join("")}</ul>
    <p class="small">${nearPlaces[0].rating ? "best-loved spots first, from google reviews. " : "closest first, from openstreetmap. "}${at.exact ? "" : "using your rough location, so distances are a guess."}</p>
    <button class="link-btn" id="near-again">← pick another kind</button>`;
}
// "you choose for me": a little shuffle through the names, then it lands on one.
function spin() {
  const pick = chooseFor(nearPlaces), btn = $("choose-for-me");
  let n = 0;
  const t = setInterval(() => {
    btn.textContent = nearPlaces[n++ % nearPlaces.length].name;
    if (n > 12) { clearInterval(t); btn.textContent = `let's go to ${pick.name}!`; setTimeout(() => goTo(pick), 900); }
  }, 90);
}
function goTo(p) {
  $("nearby").close();
  openPlace({ name: p.name, address: p.address, osm: p.osm || "", gid: p.gid || "", site: p.site || "", tap: !!p.tap, bar: nearKind === "bar" });
}

// ---------- 2. Picks ----------
let place = null, menu = null, chosen = [], shown = [];

async function openPlace(p) {
  place = p; menu = null; chosen = []; shown = []; groups = []; price = "";
  track("place-open");
  show("picks-view");
  $("place-name").textContent = p.name;
  $("place-addr").textContent = p.address || "";
  $("heads-up").hidden = true;
  $("cards").innerHTML = ""; $("after-picks").hidden = true;

  const fav = favoriteHere(journal(), p.name);
  $("favorite").hidden = !fav;
  if (fav) $("favorite").textContent = `last time you loved the ${fav.drinkName} here (${fav.rating}/10). want it again?`;

  if (!API && !aiKey()) {
    $("status").textContent = "first, add your free ai key in settings so i can read menus.";
    $("settings").showModal();
    return;
  }
  // Each place's menu is saved on the phone for the day, so coming back is instant.
  const cacheKey = `drekka-menu:${placeKey(p)}`;
  const cached = store.get(cacheKey, null);
  if (cached && cached.day === today()) { menu = cached.menu; track("menu-saved-on-phone"); return showPicks(); }

  // Find their website, open the menu pages, then let the ai pick out the drinks.
  // Fast answers show straight away; if it takes over a second, a drink gets "made" on screen.
  $("status").textContent = "";
  const started = Date.now();
  const wait = brewing($("status"), p.name, sound);
  stopWaiting = wait.stop;
  try {
    menu = await getMenu(p);
  } catch (err) {
    wait.stop();
    track("menu-error");
    if (place !== p) return;
    $("status").textContent = err.message;
    return;
  }
  if (place !== p) return wait.stop(); // they already moved on to another place
  if (!menu.found) {
    wait.stop();
    track("menu-not-found");
    $("status").textContent = "i looked everywhere and couldn't find this place's drink menu online. try another spot nearby.";
    return;
  }
  store.set(cacheKey, { day: today(), menu });
  const secs = (Date.now() - started) / 1000;
  track("menu-found", secs < 3 ? "fast" : secs < 20 ? "under 20s" : "slow");
  store.set("drekka-places-seen", store.get("drekka-places-seen", 0) + 1);
  // Fast: the picks show right away. Slow: a "see my picks" button, so nothing jumps while you read.
  wait.ready(() => { if (place === p) showPicks(); });
}

// The picks pile up on the page (newest at the bottom), so earlier ones stay there to compare.
let groups = [], price = "";

// Prices like "$6.50", "₹111" or "rs 65" -> numbers. The menu's own prices split into thirds:
// budget (cheapest third), mid, splurge (priciest third). Works in any currency.
const priceOf = (d) => parseFloat((String(d.price || "").replace(/,/g, "").match(/\d+(\.\d+)?/) || [])[0]) || null; // "$6.50", "₹120", "rs. 40"
function priceTiers() {
  const ps = menu.drinks.map(priceOf).filter(Boolean).sort((a, b) => a - b);
  if (ps.length < Math.max(4, menu.drinks.length / 2)) return null; // not enough prices on this menu
  return { low: ps[Math.floor(ps.length / 3)], high: ps[Math.floor((ps.length * 2) / 3)] };
}
function inPrice(d, tiers) {
  if (!price || !tiers) return true;
  const p = priceOf(d);
  if (p == null) return false;
  return price === "budget" ? p <= tiers.low : price === "splurge" ? p >= tiers.high : p > tiers.low && p < tiers.high;
}

// What each label means, shown small under it.
const HINTS = {
  rare: "the rarest drink here that still fits your taste",
  match: "the one that fits your taste best, from your quiz and ratings",
  signature: "what this place is known for",
  "wild card": "a surprise outside your usual, on purpose",
  steal: "a lovely pick that's easier on the wallet",
};

// Adds 3 picks to the page. title: what changed ("3 more", "mango", "budget"...), empty for the first ones.
function showPicks(title = "") {
  const tiers = priceTiers();
  const drinks = menu.drinks.filter((d) => inPrice(d, tiers));
  const prefs = profileFrom(me());
  // No alcohol unless you said you like cocktails or beer & wine in the quiz, or you chose a bar
  // or brewery yourself. A hard "no alcohol" always wins.
  if (prefs && !prefs.likesAlcohol && !(place.tap || place.bar)) prefs.noAlcohol = true;
  let picks = pickThree(drinks, journal(), place.name, chosen, shown, prefs);
  // A new flavor or price may only match drinks shown earlier: show them again rather than nothing.
  if (!picks.length && title && title !== "3 more") picks = pickThree(drinks, journal(), place.name, chosen, [], prefs);
  if (!picks.length) {
    const allBooze = !title && !groups.length && prefs?.noAlcohol && drinks.length && drinks.every(isAlcohol);
    groups.push(allBooze ? { title, empty: "everything i found here has alcohol, and you didn't say you drink. want to try another spot?" }
      : chosen.length || price ? noMatch(prefs) : { title, empty: "that's every drink here that fits you." });
  } else {
    // Plus a "steal": the best fit among this menu's lower prices (when it has prices and
    // no price is chosen yet), for anyone who'd like to spend less.
    if (tiers && !price) {
      const cheaper = drinks.filter((d) => priceOf(d) != null && priceOf(d) <= tiers.low);
      const skip = [...shown, ...picks.map((p) => p.drink.name)];
      const [first, second] = pickThree(cheaper, journal(), place.name, chosen, skip, prefs);
      const best = second || first;
      if (best) picks.push({ kind: "steal", label: "steal", drink: best.drink });
    }
    shown.push(...picks.map((p) => p.drink.name));
    groups.push({ title, picks });
    sound.reveal();
  }
  drawPicks();
  // New picks go below the "show me 3 more" button, so you scroll down to them.
  if (groups.length > 1) $("more-cards").lastElementChild.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Nothing fits the chosen flavors or price: say so, and suggest flavors this menu does have.
function or(list) { return list.length > 1 ? list.slice(0, -1).join(", ") + " or " + list.at(-1) : list[0]; }
function noMatch(prefs) {
  const ok = menu.drinks.filter((d) => !(d.flavors || []).some((f) => prefs?.noFlavors?.includes(f)));
  const ideas = flavorChips(ok).filter((f) => !chosen.includes(f) && !prefs?.noFlavors?.includes(f)).slice(0, 4);
  const what = chosen.length ? `nothing ${or(chosen)} here` : "nothing here";
  return { title: filterTitle(), empty: `${what}${price ? ` in the ${price} range` : ""} for you.${ideas.length ? " try one of these:" : " try another price."}`, ideas };
}

function drawPicks() {
  $("status").textContent = "";
  // A one-line heads-up: this menu is from the web, so the place may differ today.
  $("heads-up").textContent = menu.tap || place.tap
    ? "heads up: drekka found this tap list online. taps change often, sometimes daily, so ask what's pouring today."
    : "heads up: drekka found this menu online. the place might have changed it, or be out of something today.";
  $("heads-up").hidden = false;
  const group = (g) => `<section class="group">
    ${g.title ? `<h3 class="group-title">${esc(g.title)}</h3>` : ""}
    ${g.empty ? `<p class="hand">${esc(g.empty)}</p>` : g.picks.map(card).join("")}
    ${g.ideas?.length ? `<div class="chips">${g.ideas.map((f) => `<button class="chip idea" data-idea="${esc(f)}">${esc(f)}</button>`).join("")}</div>` : ""}
  </section>`;
  $("cards").innerHTML = groups.slice(0, 1).map(group).join("");
  $("more-cards").innerHTML = groups.slice(1).map(group).join("");
  $("after-picks").hidden = false;
  drawChips();
  const src = (menu.sources || []).map((s) => `<a href="${esc(s.uri)}" target="_blank" rel="noopener">${esc(s.title || "menu")}</a>`).join(", ");
  $("menu-note").innerHTML = `${src ? `from ${src}. ` : ""}menus change, so ask if it's still available.`;
}

function card({ kind, label, drink: d }) {
  const dots = Array.from({ length: 10 }, (_, i) => `<i class="${i < d.uniqueness ? "on" : ""}"></i>`).join("");
  return `<article class="card">
    <p class="kind">${esc(label)}</p>
    <p class="hint">${esc(HINTS[label] || "")}</p>
    <h3>${esc(d.name)}</h3>
    ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ""}
    ${d.why ? `<p class="why">${esc(d.why)}</p>` : ""}
    <div class="meta"><span class="rarity" title="uniqueness ${d.uniqueness} of 10">${dots}&nbsp;${d.uniqueness}/10 unique</span><span>${esc(d.price || "")}</span></div>
    <button class="ink-btn ghost have" data-drink="${esc(d.name)}">i'm having this · add to journal</button>
  </article>`;
}

$("picks-view").addEventListener("click", (e) => {
  const b = e.target.closest(".have");
  if (!b) return;
  sound.tap();
  const d = menu.drinks.find((x) => x.name === b.dataset.drink);
  track("pick", b.closest(".card")?.querySelector(".kind")?.textContent || "");
  openBook({ drinkName: d.name, flavors: d.flavors, uniqueness: d.uniqueness, placeName: place.name, placeAddr: place.address });
});

// What the current filters are, as a short title for the new group of picks.
const filterTitle = () => [chosen.join(" + "), price].filter(Boolean).join(" · ");

function drawChips() {
  $("more-btn").textContent = filterTitle() ? `show me ${filterTitle()}` : "show me 3 more";
  $("chips").innerHTML = flavorChips(menu.drinks).map((f) =>
    `<button class="chip ${chosen.includes(f) ? "on" : ""}" data-f="${esc(f)}">${esc(f)}</button>`).join("");
  const tiers = priceTiers();
  $("price-row").hidden = !tiers;
  if (tiers) $("price-chips").innerHTML = ["budget", "mid", "splurge"].map((t) =>
    `<button class="chip ${price === t ? "on" : ""}" data-p="${t}">${t}</button>`).join("");
}
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const f = b.dataset.f;
  chosen = chosen.includes(f) ? chosen.filter((x) => x !== f) : [...chosen, f];
  sound.chip();
  drawChips();
});
$("price-chips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  price = price === b.dataset.p ? "" : b.dataset.p;
  sound.chip();
  drawChips();
});
// Choose flavors and a price first, then this button shows picks that fit them.
$("more-btn").onclick = () => { sound.tap(); showPicks(filterTitle() || "3 more"); };
// A suggested flavor (after "nothing here"): tap it and its picks appear below.
$("more-cards").addEventListener("click", (e) => {
  const b = e.target.closest(".idea");
  if (!b) return;
  sound.tap();
  chosen = [b.dataset.idea]; price = "";
  showPicks(filterTitle());
});
let stopWaiting = () => {};
$("back-btn").onclick = () => {
  stopWaiting();
  const sawPicks = !!menu?.found;
  place = null; show("search-view");
  if (sawPicks) askFeedback(true); else $("search").focus();
};

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

// The old-photo look: black and white with a light warm tone, a little grain, soft dark corners.
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
// The polaroid can hold a photo, a short video, or nothing (a little ink drawing instead).
// Its buttons are always there, so you can change your mind after choosing "none".
let draft = null, stream = null, recorder = null;

// Videos are too big for normal storage, so they live in the phone's own small database.
const media = {
  db: null,
  open() {
    return (this.db ||= new Promise((ok, fail) => {
      const r = indexedDB.open("drekka", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("media");
      r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
    }));
  },
  async run(mode, fn) {
    const db = await this.open();
    return new Promise((ok, fail) => { const t = db.transaction("media", mode); const r = fn(t.objectStore("media")); t.oncomplete = () => ok(r?.result); t.onerror = () => fail(t.error); });
  },
  put(k, v) { return this.run("readwrite", (st) => st.put(v, k)); },
  get(k) { return this.run("readonly", (st) => st.get(k)); },
  del(k) { return this.run("readwrite", (st) => st.delete(k)); },
};

// Which picture area and buttons show: "live" camera, a "photo", a "clip", "none", or "nocam".
function polaroid(mode) {
  $("cam").hidden = mode !== "live";
  $("snap").hidden = mode !== "photo";
  $("clip").hidden = mode !== "clip";
  $("sketch").hidden = !["none", "nocam"].includes(mode);
  $("photo-btn").textContent = mode === "live" ? "snap" : mode === "photo" || mode === "clip" ? "retake" : "photo";
  $("video-btn").textContent = "video";
  $("video-btn").hidden = !window.MediaRecorder && mode !== "nocam";
  $("none-btn").hidden = mode === "none" || mode === "nocam";
  $("photo-btn").hidden = false;
  if (mode === "nocam") $("photo-btn").textContent = "photo";
  draft.mode = mode;
}

async function openBook(info) {
  draft = { ...info, rating: 0, photo: "", video: null };
  $("e-name").value = info.drinkName || "";
  $("e-place").textContent = info.placeName ? `${info.placeName}${info.placeAddr ? " · " + info.placeAddr : ""}` : "";
  $("e-note").value = "";
  clearScribble(); drawDots(); $("dots-wrap").hidden = true;
  $("book").hidden = false;
  const book = $("book").querySelector(".book");
  book.classList.remove("open");
  requestAnimationFrame(() => requestAnimationFrame(() => book.classList.add("open")));
  sound.page();
  polaroid("none");
  liveCamera(); // the camera turns on by itself, small, inside the polaroid
}

// Turn on the camera. iphones show a black box unless the video is told to play and has a size.
async function liveCamera() {
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    const cam = $("cam");
    cam.srcObject = stream;
    polaroid("live");
    await cam.play().catch(() => {});
    for (let i = 0; i < 30 && !cam.videoWidth; i++) await new Promise((r) => setTimeout(r, 100));
    if (!cam.videoWidth) throw new Error("no picture");
  } catch {
    // Blocked or unavailable: the buttons now open the phone's own camera app instead,
    // which never needs a permission (or a trip to settings).
    stopCamera();
    polaroid("nocam");
  }
}

function stopCamera() {
  if (recorder && recorder.state === "recording") recorder.stop();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; $("cam").srcObject = null;
  $("rec").hidden = true;
}

function closeBook(after) {
  stopCamera();
  $("book").querySelector(".book").classList.remove("open");
  sound.page();
  setTimeout(() => { $("book").hidden = true; after && after(); }, 800);
}

function setPhoto(dataUrl) {
  draft.photo = dataUrl; draft.video = null;
  $("snap").src = dataUrl;
  polaroid("photo");
}
function setClip(blob, poster) {
  draft.video = blob; draft.photo = poster || "";
  $("clip").src = URL.createObjectURL(blob);
  $("clip").play().catch(() => {});
  polaroid("clip");
}

// photo button: snap (camera on), retake (after a photo/clip), or photo (after "none")
$("photo-btn").onclick = async () => {
  sound.tap();
  if (draft.mode === "nocam") return $("take-photo").click();
  if (draft.mode !== "live") return liveCamera();
  setPhoto(await shrink($("cam"), 360, 0.75, true));
  stopCamera();
};

// video button: records up to 6 seconds (tap again to stop early)
$("video-btn").onclick = async () => {
  sound.tap();
  if (recorder && recorder.state === "recording") return recorder.stop();
  if (draft.mode === "nocam") return $("take-video").click();
  if (draft.mode !== "live") { await liveCamera(); if (draft.mode !== "live") return; }
  const type = ["video/mp4", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
  const poster = await shrink($("cam"), 360, 0.75, true);
  const chunks = [];
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    $("rec").hidden = true;
    const blob = new Blob(chunks, { type: recorder.mimeType || type || "video/mp4" });
    stopCamera();
    setClip(blob, poster);
  };
  recorder.start();
  $("rec").hidden = false; $("video-btn").textContent = "stop";
  $("photo-btn").hidden = true; $("none-btn").hidden = true;
  setTimeout(() => recorder?.state === "recording" && recorder.stop(), 6000);
};

$("none-btn").onclick = () => { sound.tap(); stopCamera(); draft.photo = ""; draft.video = null; polaroid("none"); };

// No camera access: pick (or take) a photo or video with the phone's own picker.
async function fromPicker(e) {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (f.type.startsWith("video/")) {
    if (f.size > 40e6) return toast("that video's too long. try a few seconds");
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(f);
    await new Promise((r) => { v.onloadeddata = r; v.onerror = r; });
    setClip(f, v.videoWidth ? await shrink(v, 360, 0.75, true) : "");
  } else setPhoto(await shrink(f, 360, 0.75, true));
}
for (const id of ["take-photo", "take-video", "upload"]) $(id).addEventListener("change", fromPicker);

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
// Read the scribbled rating ("8/10") with the ai. Returns a number, or null if it can't tell.
async function readScribble() {
  const image = pad.toDataURL("image/png").split(",")[1];
  try {
    if (API) return (await (await fetch(API + "/rating", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) })).json()).rating;
    return aiKey() ? await readRating(aiKey(), image) : null;
  } catch { return null; }
}

// One save at a time: reading the scribble takes a few seconds, and a second tap in that
// time used to save the same drink twice.
let saving = false;
$("save-entry").onclick = async () => {
  if (saving || draft?.saved) return; // already saved: the book is just closing
  saving = true;
  $("save-entry").disabled = true;
  try { await saveEntry(); } finally { saving = false; $("save-entry").disabled = false; }
};
async function saveEntry() {
  const name = $("e-name").value.trim();
  if (!name) { $("e-name").focus(); return toast("give the drink a name first"); }
  if (!draft.rating) {
    if (!scribbled) return toast("scribble your rating first, like 8/10");
    $("save-entry").textContent = "reading your scribble…";
    draft.rating = await readScribble();
    $("save-entry").textContent = "save to journal";
    if (!draft.rating) { $("dots-wrap").hidden = false; return toast("couldn't read that one. tap a number instead"); }
  }
  const entry = {
    id: Date.now(), date: today(), drinkName: name,
    placeName: draft.placeName || "", placeAddr: draft.placeAddr || "",
    flavors: draft.flavors || [], uniqueness: draft.uniqueness || null,
    rating: draft.rating, note: $("e-note").value.trim(), photo: draft.photo,
    scribble: scribbled ? pad.toDataURL("image/png") : "",
  };
  if (draft.video) {
    try { await media.put(entry.id, draft.video); entry.video = true; } catch { toast("couldn't keep the video, saving the photo"); }
  }
  if (!store.set("drekka-journal", [entry, ...journal()])) return toast("your phone is out of space for photos");
  draft.saved = true;
  sound.save();
  track("journal-save", draft.video ? "video" : draft.photo ? "photo" : "no photo");
  closeBook(() => {
    if (!$("journal-view").hidden) drawJournal();
    celebrate(entry, sound, () => askFeedback());
  });
}

// ---------- Feedback about the app (not the drink or the place) ----------
// Anyone can open it any time ("tell me what you think of drekka"). It also asks by itself, now and
// then: after the 1st and 3rd saved drink, then every 5th, and once after someone's first place
// (lots of people try drekka without saving a drink). Never twice in one day.
function openFeedback() {
  $("feedback").querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
  $("fb-change").value = ""; $("fb-like").value = "";
  $("feedback").showModal();
}
function askFeedback(afterPlace = false) {
  const n = journal().length, last = store.get("drekka-feedback-day", "");
  if (last === today()) return;
  if (afterPlace ? store.get("drekka-asked-after-place", false) : !(n === 1 || n === 3 || n % 5 === 0)) return;
  if (afterPlace) store.set("drekka-asked-after-place", true);
  store.set("drekka-feedback-day", today());
  setTimeout(openFeedback, 900);
}
document.querySelectorAll(".app-fb").forEach((b) => (b.onclick = () => { sound.tap(); if ($("settings").open) $("settings").close(); openFeedback(); }));
$("feedback").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (!b) return;
  b.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b));
  sound.chip(true);
});
$("fb-later").onclick = () => $("feedback").close();
$("fb-send").onclick = async () => {
  const answer = { about: "app", drinks: journal().length, places: store.get("drekka-places-seen", 0) };
  $("feedback").querySelectorAll(".fb-q").forEach((q) => (answer[q.dataset.q] = q.querySelector(".chip.on")?.dataset.v || ""));
  answer.change = $("fb-change").value.trim();
  answer.liked = $("fb-like").value.trim();
  if (![answer.easy, answer.picks, answer.useAgain, answer.change, answer.liked].some(Boolean)) return $("feedback").close();
  $("feedback").close(); toast("thank you, that really helps");
  track("feedback-sent");
  if (API) fetch(API + "/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answer) }).catch(() => {});
  else store.set("drekka-feedback", [...store.get("drekka-feedback", []), { ...answer, at: today() }]);
};

// ---------- Journal list ----------
// Drinks without a photo get the little ink drawing from the journal page.
const SKETCH = `<div class="sketch">${$("sketch").innerHTML}</div>`;
function drawJournal() {
  const list = journal();
  $("journal-count").textContent = list.length ? `${list.length} drink${list.length > 1 ? "s" : ""} tried so far` : "";
  $("entries").innerHTML = list.length ? list.map((e) => `
    <div class="entry" data-id="${e.id}">
      <button class="eraser" data-id="${e.id}" aria-label="erase this drink" title="erase">${ERASER}</button>
      <div class="pic">${e.video ? `<video data-id="${e.id}" poster="${e.photo || ""}" muted loop playsinline autoplay></video>` : e.photo ? `<img src="${e.photo}" alt="">` : SKETCH}</div>
      <h4>${esc(e.drinkName)}</h4>
      <div class="where">${esc(e.placeName)}${e.placeName ? " · " : ""}${esc(e.date)}</div>
      ${e.scribble ? `<img class="scrib" src="${e.scribble}" alt="">` : ""}
      <div class="score">${e.rating}/10</div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
    </div>`).join("") : `<p class="empty">your journal is empty. find a drink, then tap “add to journal”.</p>`;
  // Videos come from the phone's database.
  $("entries").querySelectorAll("video[data-id]").forEach(async (v) => {
    const blob = await media.get(+v.dataset.id).catch(() => null);
    if (blob) { v.src = URL.createObjectURL(blob); v.play().catch(() => {}); }
  });
}
// ---------- Erasing a journal entry ----------
// Tap the eraser, then rub the page with your finger: it fades bit by bit, with eraser crumbs.
// Rubbed out fully, it's gone (with a few seconds to undo). Tap the eraser again to stop.
const ERASER = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M15.5 3.5l5 5-10 10H5.5l-2-2a1.5 1.5 0 010-2.1z"/><path d="M10 9l5 5M10.5 18.5H20"/></svg>`;
const RUB_NEEDED = 900; // how much rubbing (in pixels of finger movement) erases a page
let rubbing = null;
$("entries").addEventListener("click", (e) => {
  const b = e.target.closest(".eraser");
  if (!b) return;
  const card = b.closest(".entry");
  sound.tap();
  if (card.classList.toggle("erasing")) {
    $("entries").querySelectorAll(".erasing").forEach((c) => { if (c !== card) stopErasing(c); });
    card.rubbed = card.rubbed || 0;
    toast("rub the page with your finger to erase it");
  } else stopErasing(card);
});
function stopErasing(card) {
  card.classList.remove("erasing");
  card.rubbed = 0;
  card.style.opacity = ""; card.style.filter = "";
}
$("entries").addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".entry.erasing");
  if (!card || e.target.closest(".eraser")) return;
  rubbing = { card, x: e.clientX, y: e.clientY, buzzAt: 0 };
});
$("entries").addEventListener("pointermove", (e) => {
  if (!rubbing) return;
  const { card } = rubbing;
  const step = Math.hypot(e.clientX - rubbing.x, e.clientY - rubbing.y);
  rubbing.x = e.clientX; rubbing.y = e.clientY;
  card.rubbed += step;
  const done = Math.min(1, card.rubbed / RUB_NEEDED);
  card.style.opacity = String(1 - done * 0.85);
  card.style.filter = `blur(${done * 1.5}px) grayscale(${done})`;
  if (step > 4 && Math.random() < 0.35) crumb(card, e.clientX, e.clientY);
  if (card.rubbed - rubbing.buzzAt > 120) { rubbing.buzzAt = card.rubbed; sound.tap(); }
  if (done >= 1) { rubbing = null; eraseEntry(card); }
});
for (const ev of ["pointerup", "pointercancel"]) $("entries").addEventListener(ev, () => (rubbing = null));

// A little eraser crumb that falls away from your finger.
function crumb(card, x, y) {
  const c = document.createElement("i");
  c.className = "crumb";
  const box = card.getBoundingClientRect();
  c.style.left = x - box.left + "px"; c.style.top = y - box.top + "px";
  c.style.setProperty("--dx", (Math.random() * 30 - 15).toFixed(0) + "px");
  card.appendChild(c);
  setTimeout(() => c.remove(), 700);
}

let undoErase = null;
function eraseEntry(card) {
  const id = +card.dataset.id;
  const list = journal(), entry = list.find((x) => x.id === id);
  if (!entry) return;
  sound.page();
  card.classList.add("gone");
  setTimeout(() => {
    store.set("drekka-journal", list.filter((x) => x.id !== id));
    drawJournal();
    // A few seconds to change your mind; the video is only deleted after that.
    clearTimeout(undoErase?.timer);
    undoErase = { entry, timer: setTimeout(() => { media.del(id).catch(() => {}); undoErase = null; }, 6000) };
    toast("erased. tap here to undo", 6000);
  }, 400);
}
$("toast").addEventListener("click", () => {
  if (!undoErase) return;
  clearTimeout(undoErase.timer);
  store.set("drekka-journal", [...journal(), undoErase.entry].sort((a, b) => b.id - a.id));
  undoErase = null;
  $("toast").hidden = true;
  sound.save();
  drawJournal();
});
$("journal-btn").onclick = () => { sound.page(); drawJournal(); show("journal-view"); };
$("journal-back").onclick = () => show(place ? "picks-view" : "search-view");
$("new-entry").onclick = () => openBook({ drinkName: "", placeName: "", placeAddr: "" });

// ---------- Settings ----------
// Looks: tap one and the whole app changes right away.
function drawLooks() {
  $("looks").innerHTML = LOOKS.map((l) => `<button class="chip look ${currentLook() === l.id ? "on" : ""}" data-look="${l.id}"><i style="background:${l.dot}"></i>${l.name}</button>`).join("");
}
$("looks").addEventListener("click", (e) => {
  const b = e.target.closest("[data-look]");
  if (!b) return;
  sound.chip(true); setLook(b.dataset.look); track("look", b.dataset.look); drawLooks();
});
$("settings-btn").onclick = () => {
  drawLooks();
  $("dev-keys").hidden = !!API; // with drekka's server, nobody needs keys
  $("key-input").value = aiKey();
  $("jina-input").value = store.get("drekka-jina", "");
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
    track(answers ? "quiz-done" : "quiz-skipped");
    if (answers) store.set("drekka-me", answers);
    store.set("drekka-welcomed", true);
    greet();
    if (!store.get("drekka-toured", false)) setTimeout(showTour, 400);
    if (!API && !aiKey()) $("settings").showModal(); // testing without the server: add your own key
  });
}
// Opening drekka: the glass animation first. The very first time it's "tap to open", the
// walk-through and the "good to know" page, then the taste quiz.
const firstTime = !store.get("drekka-intro-seen", false);
if (firstTime) track("first-visit");
runIntro(sound, firstTime, () => {
  if (firstTime) track("intro-done");
  store.set("drekka-intro-seen", true);
  if (!store.get("drekka-welcomed", false)) startQuiz();
  else if (!store.get("drekka-toured", false)) showTour();
});
// The little tour of the buttons: once, right after the welcome and quiz (and from settings).
function showTour() {
  show("search-view");
  runTour(sound, () => { track("tour-done"); store.set("drekka-toured", true); });
}
$("replay-tour").onclick = () => { $("settings").close(); showTour(); };
$("replay-intro").onclick = () => { $("settings").close(); runIntro(sound, true, () => {}); };
greet();
$("settings-close").onclick = () => $("settings").close();
$("key-save").onclick = () => {
  store.set("drekka-key", $("key-input").value.trim());
  store.set("drekka-jina", $("jina-input").value.trim());
  $("settings").close(); toast("saved");
  if (place && !menu) openPlace(place);
};
$("clear-data").onclick = () => {
  if (!confirm("erase every drink in your journal on this device? this can't be undone.")) return;
  store.set("drekka-journal", []); drawJournal(); toast("journal erased");
};

// Works offline and installs like an app.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
