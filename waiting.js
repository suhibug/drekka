// While a menu is being read for the first time (it can take up to a minute), something fun
// happens on screen: a drink gets made, the steps change, and there's a deck of drink-fact
// flashcards to play with (tap a card to flip it, swipe or tap "next" for another).
// When the menu is ready, a "your picks are ready" button appears: nothing jumps while you read.
// If the menu is ready fast (it's saved, or quick to read), none of this shows at all.
import { startDots, stopDots } from "./motion.js";
import { track } from "./track.js";

// True, simple drink facts. Keep them accurate: no guesses.
const FACTS = [
  "boba pearls are made from tapioca, which comes from the cassava root.",
  "bubble tea was born in taiwan in the 1980s.",
  "coffee beans are really the seeds of a fruit called the coffee cherry.",
  "cascara is a tea made from the dried skins of coffee cherries.",
  "cold brew isn't brewed hot at all: the coffee soaks in cold water for 12 to 24 hours.",
  "matcha is whole green tea leaves ground into powder, so you drink the leaf itself.",
  "hojicha is green tea that's been roasted, which makes it toasty and low in bitterness.",
  "“chai” simply means “tea” in hindi.",
  "earl grey gets its flavor from bergamot, a kind of citrus.",
  "agua fresca means “fresh water” in spanish.",
  "mexican horchata is usually made with rice, cinnamon and sugar.",
  "lassi is a yogurt drink from the indian subcontinent.",
  "hops give beer its bitterness and a lot of its smell.",
  "a cortado is espresso “cut” with a little warm milk: cortado means “cut” in spanish.",
  "dalgona coffee, the whipped one, went viral in 2020.",
  "oolong sits between green and black tea: it's only partly oxidized.",
];

// The ways to open a card. They take turns, so every card feels a bit different.
const GAMES = ["flip", "scratch", "slide", "hold"];

const STEPS = ["finding their menu", "reading every drink on it", "picking out the rare ones", "almost ready to pour"];

const GLASS = `<svg class="glass brewing" viewBox="0 0 120 160" aria-hidden="true">
  <defs><clipPath id="cup2"><path d="M22 30h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7z"/></clipPath></defs>
  <g clip-path="url(#cup2)"><rect class="liquid" x="0" y="0" width="120" height="160"/>
    <circle class="bub" cx="45" cy="150" r="2.4"/><circle class="bub" cx="62" cy="150" r="1.8"/><circle class="bub" cx="75" cy="150" r="2.2"/>
    <circle class="bub" cx="54" cy="150" r="1.4"/><circle class="bub" cx="68" cy="150" r="2.6"/></g>
  <path class="rim" d="M22 30h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7z"/><path class="rim straw" d="M70 30l12-26h8"/>
</svg>`;

// Shows the brewing screen in `box` after a short wait.
// Returns { stop, ready }: stop() clears it; ready(show) runs show() right away if the screen
// never appeared, or else puts a "your picks are ready" button up and runs show() when it's tapped.
export function brewing(box, placeName, sound) {
  let timers = [], shown = false, done = false;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const $ = (id) => box.querySelector("#" + id);
  const order = FACTS.map((_, i) => i).sort(() => Math.random() - 0.5);
  let card = 0;

  later(() => {
    shown = true;
    let step = 0;
    box.innerHTML = `<div class="brew">
      ${GLASS}
      <p class="brew-step hand big" id="brew-step">${STEPS[0]}</p>
      <p class="brew-wait small" id="brew-wait"></p>
      <div class="flash-wrap">
        <p class="fact-label">while you wait: drink flashcards</p>
        <div class="flash" id="flash"></div>
        <div class="flash-nav"><span class="small" id="flash-count"></span><button class="link-btn" id="flash-next">next card →</button></div>
      </div>
    </div>`;
    startDots();
    deal();
    timers.push(setInterval(() => { if (!done && step < STEPS.length - 1) swap($("brew-step"), STEPS[++step]); }, 5000));
    later(() => { if (!done) swap($("brew-wait"), `first time anyone looks up ${placeName}, so this can take up to a minute. after that it's instant.`); }, 6000);
    later(() => { if (!done) swap($("brew-wait"), "still on it. some menus hide deep in their websites."); }, 45000);

    $("flash-next").onclick = () => next();
  }, 1000);

  // Each card is a little game you have to play to open it: flip, scratch, slide, or hold.
  function deal() {
    const flash = $("flash");
    const game = GAMES[card % GAMES.length];
    $("flash-count").textContent = `card ${(card % order.length) + 1} of ${order.length}`;
    openCard(flash, game, FACTS[order[card % order.length]], sound);
  }
  function next() {
    const flash = $("flash");
    sound?.page();
    flash.classList.add("out-left");
    setTimeout(() => {
      card++; deal();
      flash.classList.remove("out-left");
      flash.classList.add("deal-in");
      setTimeout(() => flash.classList.remove("deal-in"), 350);
    }, 220);
  }

  function stop() {
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    if (shown) { stopDots(); box.innerHTML = ""; }
  }
  function ready(show) {
    done = true;
    if (!shown) { stop(); return show(); }
    // Keep the flashcards; swap the "making it" part for a button.
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    box.querySelector(".glass")?.classList.add("full");
    box.querySelector(".flash-wrap .fact-label").textContent = "drink flashcards (keep playing, or see your picks)";
    $("brew-step").classList.add("done");
    $("brew-step").textContent = "your picks are ready";
    $("brew-wait").innerHTML = `<button class="ink-btn ready-btn" id="see-picks">see my picks</button>`;
    sound?.reveal();
    $("see-picks").onclick = () => { sound?.tap(); track("see-picks-after-wait"); stop(); show(); };
  }
  return { stop, ready };
}

// Fades text out, changes it, fades it back in.
function swap(el, text) {
  if (!el) return;
  el.classList.add("swap-out");
  setTimeout(() => { el.textContent = text; el.classList.remove("swap-out"); }, 300);
}

// Builds one card in `flash` as a game. When it's opened, the fact shows.
function openCard(flash, game, fact, sound) {
  flash.className = `flash game-${game}`;
  delete flash.dataset.counted;
  const back = `<div class="flash-face back"><p class="hand">${fact}</p></div>`;
  const opened = () => { if (flash.classList.contains("open")) return; flash.classList.add("open"); sound?.reveal(); track("card-opened", game); };
  flash.setAttribute("role", "button");
  flash.tabIndex = 0;
  flash.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); game === "flip" ? flash.classList.toggle("flipped") : opened(); } };
  flash.onclick = null; flash.onpointerdown = flash.onpointermove = flash.onpointerup = flash.onpointercancel = null;

  if (game === "flip") {
    flash.setAttribute("aria-label", "drink fact card. tap to flip");
    flash.innerHTML = `<div class="flash-face front"><span class="flash-q">did you know?</span><span class="small">tap to flip</span></div>${back}`;
    flash.onclick = () => { flash.classList.toggle("flipped"); sound?.page(); if (flash.classList.contains("flipped") && !flash.dataset.counted) { flash.dataset.counted = 1; track("card-opened", "flip"); } };
    return;
  }

  if (game === "scratch") {
    flash.setAttribute("aria-label", "mystery drink fact. scratch to reveal, or press enter");
    flash.innerHTML = `${back}<canvas class="scratch" aria-hidden="true"></canvas>`;
    const cv = flash.querySelector("canvas"), ctx = cv.getContext("2d"), s = devicePixelRatio || 1;
    const w = flash.clientWidth, h = flash.clientHeight;
    cv.width = w * s; cv.height = h * s;
    const css = getComputedStyle(document.documentElement);
    ctx.scale(s, s);
    ctx.fillStyle = css.getPropertyValue("--leather").trim() || "#4a3121"; ctx.fillRect(0, 0, w, h);
    // a few sparkles so it looks like a scratch card
    ctx.fillStyle = css.getPropertyValue("--brass").trim() || "#c9a45c";
    for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = "#f3e3c3"; ctx.textAlign = "center";
    ctx.font = "700 32px Caveat, cursive"; ctx.fillText("mystery fact", w / 2, h / 2 + 4);
    ctx.font = "15px Caveat, cursive"; ctx.fillText("scratch to reveal ✦", w / 2, h / 2 + 28);
    ctx.globalCompositeOperation = "destination-out";
    let down = false, moves = 0;
    const rub = (e) => {
      const r = cv.getBoundingClientRect();
      ctx.beginPath(); ctx.arc(e.clientX - r.left, e.clientY - r.top, 20, 0, 6.3); ctx.fill();
      if (++moves % 6) return;
      // how much is scratched off? check every few moves
      const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0, total = 0;
      for (let i = 3; i < px.length; i += 4 * 40) { total++; if (px[i] === 0) clear++; }
      if (clear / total > 0.5) opened();
    };
    cv.onpointerdown = (e) => { down = true; cv.setPointerCapture(e.pointerId); rub(e); };
    cv.onpointermove = (e) => { if (down) rub(e); };
    cv.onpointerup = cv.onpointercancel = () => { down = false; };
    return;
  }

  if (game === "slide") {
    flash.setAttribute("aria-label", "drink fact card. slide the lid off, or press enter");
    flash.innerHTML = `${back}<div class="lid"><span class="flash-q">slide the lid off</span><span class="lid-grip">⟵ drag ⟶</span></div>`;
    const lid = flash.querySelector(".lid");
    let x0 = null;
    lid.onpointerdown = (e) => { x0 = e.clientX; lid.setPointerCapture(e.pointerId); lid.style.transition = "none"; };
    lid.onpointermove = (e) => { if (x0 != null) lid.style.transform = `translateX(${e.clientX - x0}px) rotate(${(e.clientX - x0) / 40}deg)`; };
    lid.onpointerup = lid.onpointercancel = (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0; x0 = null;
      lid.style.transition = "";
      if (Math.abs(dx) > flash.clientWidth * 0.4) { lid.style.transform = `translateX(${dx > 0 ? 130 : -130}%) rotate(${dx > 0 ? 14 : -14}deg)`; opened(); }
      else lid.style.transform = ""; // not far enough: it springs back
    };
    return;
  }

  // hold: press and hold to pour; let go too early and it drains back out
  flash.setAttribute("aria-label", "drink fact card. press and hold to pour, or press enter");
  flash.innerHTML = `${back}<div class="lid hold"><div class="pour"></div><span class="flash-q">hold to pour</span><span class="small">keep your finger down</span></div>`;
  const lid = flash.querySelector(".lid");
  let p = 0, holding = false, last = 0, raf = 0;
  const tick = (now) => {
    const dt = (now - (last || now)) / 1000; last = now;
    p = Math.min(1, Math.max(0, p + (holding ? dt / 1.4 : -dt / 0.8)));
    lid.style.setProperty("--p", p);
    if (p >= 1) { cancelAnimationFrame(raf); opened(); return; }
    if (holding || p > 0) raf = requestAnimationFrame(tick); else last = 0;
  };
  lid.onpointerdown = (e) => { e.preventDefault(); holding = true; lid.setPointerCapture(e.pointerId); last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
  lid.onpointerup = lid.onpointercancel = () => { holding = false; };
  lid.oncontextmenu = (e) => e.preventDefault();
}
