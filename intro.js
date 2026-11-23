// The welcome: a glass fills up and fizzes while "drekka" writes itself in. The first time,
// you tap to open it (a can-opening sound plays), then a short story walks you through what
// drekka does before the taste quiz starts. Little dots on the edges move with the phone.
// Every time after that, just the quick glass animation plays (tap to skip it).

import { askForMotion, startDots, stopDots } from "./motion.js";

const $ = (id) => document.getElementById(id);

// The glass: liquid rising, bubbles floating up, a straw. Drawn in ink like the rest of drekka.
const GLASS = `<svg class="glass" viewBox="0 0 120 160" aria-hidden="true">
  <defs><clipPath id="cup"><path d="M22 30h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7z"/></clipPath></defs>
  <g clip-path="url(#cup)">
    <rect class="liquid" x="0" y="0" width="120" height="160"/>
    <circle class="bub" cx="45" cy="150" r="2.6"/><circle class="bub" cx="62" cy="150" r="1.8"/>
    <circle class="bub" cx="75" cy="150" r="2.2"/><circle class="bub" cx="54" cy="150" r="1.4"/>
    <circle class="bub" cx="68" cy="150" r="3"/><circle class="bub" cx="40" cy="150" r="1.6"/>
    <circle class="bub" cx="80" cy="150" r="1.4"/><circle class="bub" cx="58" cy="150" r="2"/>
  </g>
  <path class="rim" d="M22 30h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7z"/>
  <path class="rim straw" d="M70 30l12-26h8"/>
</svg>`;

// The walk-through: a short story that welcomes you in. Each line floats in as you read.
const PAGES = [
  { h: "psst. come on in.", p: [
    "you know that moment at the counter? the menu is huge, the line is moving, and you panic-order the same drink. again.",
    "drekka is here to end that.",
  ] },
  { h: "meet your drink sidekick", p: ["tell drekka where you are. it reads the whole menu for you, then hands you the good stuff:"], cards: [
    ["rare", "the most unusual thing on the menu"],
    ["match", "the one made for your taste"],
    ["wild card", "a little chaos, on purpose"],
  ] },
  { h: "out with no plan?", p: [
    "been there. tap <b>find a spot near me</b>, say what you're craving (coffee, boba, a bar, a brewery), and you'll see the places people around you love most.",
    "still torn? tap <b>just pick one for me</b> and let fate decide.",
  ] },
  { h: "keep the story going", p: [
    "loved a drink? save it to your journal with a photo and a scribbled 9/10.",
    "every drink you rate teaches drekka a little more about you.",
  ] },
  { h: "the fine print (it's short, promise)", p: [
    "menus come from the internet, so a place might have changed things, or run out of something today.",
    "your journal lives on your phone. it's all yours.",
    "your location is only used when you ask for spots near you.",
  ], last: true },
];

// first: true the very first time (tap to open + walk-through). done() runs when it's over.
export function runIntro(sound, first, done) {
  const box = $("intro");
  box.hidden = false;
  box.innerHTML = `<div class="splash">${GLASS}<h1 class="intro-title">drekka</h1>
    <p class="hand">a journal of rare drinks</p>
    ${first ? `<button class="ink-btn tap-open" id="tap-open">tap to open</button>` : ""}</div>`;
  const splash = box.querySelector(".splash");

  if (!first) {
    // A quick sip of the animation, then straight in.
    const close = () => { if (box.hidden) return; box.classList.add("fade-out"); setTimeout(() => { box.hidden = true; box.classList.remove("fade-out"); done(); }, 450); };
    const t = setTimeout(close, 1700);
    box.onclick = () => { clearTimeout(t); close(); };
    return;
  }
  $("tap-open").onclick = () => {
    sound.wake();
    sound.open();
    askForMotion(); // the dots can follow the phone's movement (iphones ask first)
    startDots();
    splash.classList.add("opened"); // the bubbles burst up
    setTimeout(() => page(0), 1300);
  };

  function page(i) {
    const pg = PAGES[i];
    const dots = PAGES.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("");
    let n = 0; // each line floats in a little after the one before
    const line = (html, tag = "p", cls = "hand big") => `<${tag} class="${cls} float-in" style="--i:${n++}">${html}</${tag}>`;
    box.onclick = null;
    box.innerHTML = `<div class="quiz-page intro-page">
      <div class="quiz-dots">${dots}</div>
      ${GLASS.replace('class="glass"', 'class="glass small bob"')}
      ${line(pg.h, "h2", "ink")}
      ${pg.p.map((t) => line(t)).join("")}
      ${pg.cards ? `<div class="intro-cards">${pg.cards.map(([k, t]) => line(`<b>${k}</b><span>${t}</span>`, "div", "intro-card float-in")).join("")}</div>` : ""}
      <div class="quiz-nav float-in" style="--i:${n++}">
        ${i > 0 ? `<button class="link-btn" id="intro-back">← back</button>` : "<span></span>"}
        <button class="ink-btn" id="intro-next">${pg.last ? "okay, pour me something" : "next"}</button>
      </div>
    </div>`;
    $("intro-next").onclick = () => {
      sound.page();
      if (i < PAGES.length - 1) return page(i + 1);
      stopDots();
      box.hidden = true;
      done();
    };
    if ($("intro-back")) $("intro-back").onclick = () => { sound.page(); page(i - 1); };
  }
}
