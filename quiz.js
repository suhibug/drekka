// The "get to know you" welcome: one question per page, all taps, shown the first time someone
// opens drekka (and again from settings). Answers are saved as "drekka-me" and shape the picks.

// Each step: id, question, choices, multi (tap several) or single, and an optional "only if" rule.
// Choices map to flavor words (f) the ai uses, and to words to look for in drink names (w).
const STEPS = [
  { id: "name", q: "hi! what should i call you?", type: "text", placeholder: "your name" },
  { id: "kinds", q: "what do you usually reach for?", hint: "tap all that feel like you", multi: true, choices: [
    { t: "coffee", f: ["coffee"], w: ["latte", "espresso", "coffee", "cold brew", "cortado", "mocha"] },
    { t: "tea", f: ["tea"], w: ["tea", "chai", "oolong", "jasmine"] },
    { t: "matcha", f: ["tea"], w: ["matcha"] },
    { t: "boba", f: ["tea", "creamy"], w: ["boba", "pearl", "milk tea"] },
    { t: "smoothies & juice", f: ["fruity"], w: ["smoothie", "juice", "lemonade"] },
    { t: "sodas & refreshers", f: ["fruity", "sweet"], w: ["soda", "refresher", "sparkling", "fizz"] },
    { t: "shakes", f: ["creamy", "sweet"], w: ["shake", "frapp", "float"] },
    { t: "cocktails", f: [], w: ["cocktail", "mojito", "margarita", "spritz", "martini"], alcohol: true },
    { t: "mocktails", f: ["fruity"], w: ["mocktail", "spritz", "virgin"] },
    { t: "beer & wine", f: [], w: ["beer", "ale", "ipa", "wine", "cider"], alcohol: true },
  ] },
  { id: "coffee", q: "how do you like your coffee?", multi: true, onlyIf: (me) => me.kinds?.includes("coffee"), choices: [
    { t: "creamy lattes", f: ["creamy"], w: ["latte"] },
    { t: "strong & black", f: ["coffee"], w: ["espresso", "americano", "black", "cortado"] },
    { t: "cold brew", f: ["coffee"], w: ["cold brew"] },
    { t: "sweet & dessert-y", f: ["caramel", "chocolate", "sweet"], w: ["mocha", "caramel", "tiramisu"] },
    { t: "spiced", f: ["spicy"], w: ["chai", "cardamom", "cinnamon", "spiced"] },
    { t: "nutty", f: ["nutty"], w: ["pistachio", "hazelnut", "almond"] },
  ] },
  { id: "tea", q: "and your tea mood?", multi: true, onlyIf: (me) => ["tea", "matcha", "boba"].some((k) => me.kinds?.includes(k)), choices: [
    { t: "fruity tea", f: ["fruity", "tea"], w: ["fruit tea", "passion", "mango", "peach"] },
    { t: "milk tea", f: ["creamy", "tea"], w: ["milk tea", "latte"] },
    { t: "matcha", f: ["tea"], w: ["matcha"] },
    { t: "floral", f: ["floral"], w: ["jasmine", "rose", "lavender", "osmanthus"] },
    { t: "brown sugar", f: ["caramel", "sweet"], w: ["brown sugar"] },
    { t: "earthy & roasty", f: ["nutty"], w: ["oolong", "hojicha", "barley", "black tea"] },
  ] },
  { id: "cocktail", q: "your kind of cocktail?", multi: true, onlyIf: (me) => me.kinds?.some((k) => k === "cocktails" || k === "mocktails"), choices: [
    { t: "sour & citrusy", f: ["sour", "citrus"], w: ["sour", "margarita", "lime"] },
    { t: "sweet & fruity", f: ["fruity", "sweet"], w: ["berry", "peach", "passion"] },
    { t: "tropical", f: ["fruity", "coconut"], w: ["pineapple", "coconut", "mango", "tiki"] },
    { t: "minty & fresh", f: ["herbal"], w: ["mojito", "mint", "basil"] },
    { t: "spicy", f: ["spicy"], w: ["jalapeño", "chili", "ginger", "spicy"] },
    { t: "bubbly", f: ["citrus"], w: ["spritz", "sparkling", "fizz"] },
  ] },
  { id: "loves", q: "flavors you love?", hint: "tap as many as you like", multi: true, choices: [
    "fruity", "citrus", "berry", "tropical", "coconut", "chocolate", "caramel", "vanilla", "nutty",
    "floral", "herbal", "spicy", "creamy", "sour", "smoky", "coffee", "tea", "sweet",
  ].map((t) => ({ t, f: [t] })) },
  { id: "skips", q: "anything you'd rather skip?", hint: "it's okay to say none", multi: true, choices: [
    ...["chocolate", "coffee", "creamy", "sour", "spicy", "smoky", "floral", "herbal", "coconut", "nutty"].map((t) => ({ t, f: [t] })),
    { t: "too sweet", f: ["sweet"] },
    { t: "no alcohol", f: [], noAlcohol: true },
  ] },
  { id: "places", q: "where do you usually end up?", multi: true, choices: [
    "cafés", "boba shops", "bars", "restaurants", "dessert spots", "juice bars", "breweries",
  ].map((t) => ({ t })) },
  { id: "adventure", q: "how adventurous are you with drinks?", multi: false, choices: [
    { t: "keep it safe", a: 0.15 },
    { t: "a little twist", a: 0.35 },
    { t: "the weirder the better", a: 0.7 },
  ] },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Turn the answers into what picks.js needs: liked/skipped flavors, words to look for, adventure.
export function profileFrom(me) {
  if (!me) return null;
  const loves = {}, words = new Set();
  let noAlcohol = false;
  const add = (f, w) => { loves[f] = (loves[f] || 0) + w; };
  for (const step of STEPS) {
    const picked = me[step.id];
    if (!Array.isArray(picked)) continue;
    for (const c of step.choices.filter((c) => picked.includes(c.t))) {
      if (step.id === "skips") { (c.f || []).forEach((f) => add(f, -1.5)); if (c.noAlcohol) noAlcohol = true; continue; }
      (c.f || []).forEach((f) => add(f, step.id === "loves" ? 1 : 0.5));
      (c.w || []).forEach((w) => words.add(w));
    }
  }
  const adventure = STEPS.find((s) => s.id === "adventure").choices.find((c) => c.t === me.adventure)?.a ?? 0.35;
  return { loves, words: [...words], noAlcohol, adventure };
}

// A friendly one-line summary for the end of the quiz (and settings).
export function summary(me) {
  const bits = [...(me.loves || []).slice(0, 3)];
  const kind = (me.kinds || [])[0];
  return `you're a ${bits.length ? bits.join(", ") + " " : ""}${kind ? kind + " " : ""}kind of drinker${me.adventure ? `, and you like ${me.adventure === "keep it safe" ? "to keep it safe" : me.adventure === "a little twist" ? "a little twist" : "it weird"}` : ""}.`;
}

// Runs the quiz. sound: the sound module. Calls done(me) at the end.
export function runQuiz(sound, saved, done) {
  const me = { ...(saved || {}) };
  const box = $("quiz");
  box.hidden = false;
  let i = 0;

  const steps = () => STEPS.filter((s) => !s.onlyIf || s.onlyIf(me));
  function draw() {
    const list = steps();
    const s = list[i];
    if (!s) return finish();
    const dots = list.map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("");
    let body;
    if (s.type === "text") {
      body = `<input id="quiz-text" class="quiz-input" placeholder="${esc(s.placeholder)}" value="${esc(me[s.id] || "")}" autocomplete="given-name">`;
    } else {
      const chosen = s.multi ? (me[s.id] || []) : [me[s.id]];
      body = `<div class="quiz-chips">${s.choices.map((c) =>
        `<button class="chip big ${chosen.includes(c.t) ? "on" : ""}" data-t="${esc(c.t)}">${esc(c.t)}</button>`).join("")}</div>`;
    }
    box.innerHTML = `<div class="quiz-page">
      <div class="quiz-dots">${dots}</div>
      <h2 class="ink">${esc(i > 0 && me.name && s.id === "kinds" ? `nice to meet you, ${me.name}. ` : "")}${esc(s.q)}</h2>
      ${s.hint ? `<p class="hand">${esc(s.hint)}</p>` : ""}
      ${body}
      <div class="quiz-nav">
        ${i > 0 ? `<button class="link-btn" id="quiz-back">← back</button>` : "<span></span>"}
        <button class="ink-btn" id="quiz-next">${i === list.length - 1 ? "done" : "next"}</button>
      </div>
      <button class="link-btn quiz-skip" id="quiz-skip">skip for now</button>
    </div>`;
    const text = $("quiz-text");
    if (text) { text.focus(); text.onkeydown = (e) => { if (e.key === "Enter") next(); }; }
    box.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
      const t = b.dataset.t;
      if (s.multi) {
        const cur = me[s.id] || [];
        me[s.id] = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
        b.classList.toggle("on");
        sound.chip(b.classList.contains("on"));
      } else {
        me[s.id] = t; sound.chip(true);
        setTimeout(next, 250); // single choice moves on by itself
      }
    }));
    $("quiz-next").onclick = next;
    $("quiz-skip").onclick = () => { box.hidden = true; done(saved || null); };
    if ($("quiz-back")) $("quiz-back").onclick = () => { i--; sound.page(); draw(); };
  }
  function next() {
    const s = steps()[i];
    if (s?.type === "text") me[s.id] = $("quiz-text").value.trim().toLowerCase();
    i++; sound.page(); draw();
  }
  function finish() {
    sound.save();
    box.innerHTML = `<div class="quiz-page done">
      <h2 class="ink">${me.name ? `skál, ${esc(me.name)}!` : "skál!"}</h2>
      <p class="hand big">${esc(summary(me))}</p>
      <p class="hand">i'll keep learning from every drink you rate.</p>
      <button class="ink-btn" id="quiz-start">let's find a drink</button>
    </div>`;
    $("quiz-start").onclick = () => { box.hidden = true; done(me); };
  }
  draw();
}
