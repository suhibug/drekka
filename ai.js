// Google's Gemini AI (free tier). Two jobs:
//   readMenu:   menu page text (found by menu.js) -> the drinks, with a uniqueness score and flavors
//   readRating: a picture of your scribbled rating ("8/10") -> the number
// Runs on the drekka server (worker/) so people don't need their own key. The key is passed in.

// Google retires old models often, so try a few in order and remember the first one that answers.
// Free tier (Nov 2026): Gemini 3.5 Flash Lite, 15 a minute and 500 a day. (Web search isn't free
// for Gemini 3 and newer, which is why menu.js finds and reads the menu pages itself.)
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];
let lastGood = null;

// A compact answer on purpose (a list per drink instead of named fields): the AI writes about
// half as much, so the menu comes back about twice as fast.
const FORMAT = `Return ONLY JSON: {"found": true, "d": [[name, price, uniqueness, why, flavors, flags], ...]}
- name: the drink's name as written: its title on the menu (like "GBuzz" or "Dubai Chocolate"), never the line describing it (like "banana, mango and apple"). If a menu lists only flavors under a heading, name it "<flavor> <heading>" (like "mango smoothie"). price: as written, in the menu's own currency (like "$6.50" or "₹120"; never convert it), or "".
- uniqueness: 1-10. 1 = you can get it almost anywhere (chocolate shake, iced latte, plain cola).
  10 = rare: only here, or a very unusual combination. Be honest and spread the scores out.
- why: max 7 words, what makes it special (or why it's common).
- flavors: 2-4 lowercase words from: fruity, citrus, berry, tropical, coconut, mango, chocolate, caramel, vanilla, nutty, floral, herbal, spicy, smoky, creamy, sour, sweet, coffee, tea, minty, cola, hoppy, malty, crisp.
- beer on tap: name it as listed (like "Hop Ollie IPA"); put its style and ABV in why when given (like "hazy IPA, 6.8% ABV").
  Always include "coffee" if it has coffee or espresso.
- flags: "" or letters: p = marked popular or signature, s = seasonal, a = has alcohol.
Up to 45 drinks. Leave out food. List each drink once.`;

// The reader adds a list of links at the end of each page; the AI doesn't need it.
const clean = (t) => t.replace(/\n(Links\/Buttons|Images):[\s\S]*$/, "").replace(/\n{3,}/g, "\n\n");

async function ask(key, parts, json = true, tools = null) {
  const body = { contents: [{ role: "user", parts }], generationConfig: json ? { responseMimeType: "application/json" } : {} };
  if (tools) body.tools = tools;
  let res;
  for (const model of lastGood ? [lastGood, ...MODELS.filter((m) => m !== lastGood)] : MODELS) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    // 404 = model retired, 503 = model busy, 429 = this model's free allowance is used up for now.
    // Each model has its own allowance, so try the next one.
    if (![404, 429, 503].includes(res.status)) { if (res.ok) lastGood = model; break; }
  }
  if ([404, 429, 503].includes(res.status)) throw Object.assign(new Error("lots of people are searching right now. try again in a minute."), { busy: true });
  if (!res.ok) throw new Error("the ai didn't answer (" + res.status + "). try again in a minute.");
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  ask.lastSources = (data.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter(Boolean);
  return text;
}

// Reads the ai's json even when it forgot a closing bracket or two at the very end (it sometimes does).
function parseLoose(out) {
  const start = out.indexOf("{");
  if (start < 0) return null;
  const body = out.slice(start).replace(/```\s*$/, "").trim().replace(/,\s*$/, "");
  for (const ending of ["", "}", "]}", "]]}", "\"]]}", "\"]]]}"]) {
    try { return JSON.parse(body + ending); } catch { /* try the next ending */ }
  }
  // A bracket missing just before the last "}".
  for (const ending of ["]}", "]]}"]) {
    try { return JSON.parse(body.replace(/}\s*$/, "") + ending); } catch { /* try the next one */ }
  }
  try { return JSON.parse(out.slice(start, out.lastIndexOf("}") + 1)); } catch { return null; }
}

// place: { name, address }. pages: [{ url, text }] from menu.js (most drink-filled first)
export async function readMenu(key, place, pages) {
  let budget = 30000;
  const text = pages.map((p) => {
    const t = clean(p.text).slice(0, Math.max(0, budget));
    budget -= t.length;
    return t ? `--- page: ${p.url}\n${t}` : "";
  }).join("\n\n");
  const where = `${place.name}${place.address ? ", " + place.address : ""}`;
  const parts = [{ text: `Below is web text about the menu of ${where}. List the drinks on it. Only use pages that are clearly about THIS place (same name; same city if one is given), and ignore pages about any other place, even with a similar name. Only include drinks that are actually written in this text; never invent any. If there are no drinks for this exact place, return {"found": false}.${place.tap ? " This place is a brewery or taproom: list the beers on tap first (all of them), then its other drinks." : ""}\n${FORMAT}\n\n${text}` }];
  // Now and then the ai's answer comes back garbled: ask again (the last try uses a different
  // model) before giving up.
  let menu;
  for (let attempt = 0; attempt < 3 && !menu; attempt++) {
    if (attempt === 2) lastGood = MODELS.find((m) => m !== lastGood);
    const out = await ask(key, parts);
    menu = parseLoose(out);
  }
  if (!menu) throw new Error("couldn't read the menu this time. try again.");
  if (!menu.found || !menu.d?.length) return { found: false, drinks: [] };
  return tidy(menu, pages.slice(0, 2).map((p) => ({ uri: p.url, title: new URL(p.url).hostname.replace(/^www\./, "") })));
}

// The ai's compact lists -> drinks with named fields.
function tidy(menu, sources) {
  menu.drinks = menu.d.filter((r) => Array.isArray(r) && r[0]).map(([name, price, u, why, flavors, flags = ""]) => ({
    name: String(name), price: String(price || ""), why: String(why || ""),
    uniqueness: Math.max(1, Math.min(10, Math.round(+u || 5))),
    flavors: (Array.isArray(flavors) ? flavors : String(flavors || "").split(/[,\s]+/)).map((f) => String(f).toLowerCase().trim()).filter(Boolean).slice(0, 4),
    popular: /p/.test(flags), seasonal: /s/.test(flags), alcohol: /a/.test(flags),
  }));
  delete menu.d;
  menu.sources = sources;
  return menu;
}

// The last resort, when the free search found nothing: Google Search, through the paid key.
// (Used only a limited number of times a month; the server keeps count. See worker/index.js.)
export async function readMenuWithGoogle(key, place) {
  const where = `${place.name}${place.address ? ", " + place.address : ""}`;
  const out = await ask(key, [{ text: `Search Google for the current drink menu of this exact place: ${where}. Use its website, online ordering pages, food apps, reviews or recent posts, and list every drink you can find (coffee, tea, cocktails, mocktails, beer, wine, smoothies...). Only include drinks you actually found for this exact place (not a different place with a similar name); never invent any. If you can't find its menu, return {"found": false}.\n${FORMAT}` }], false, [{ google_search: {} }]);
  const menu = parseLoose(out);
  if (!menu?.found || !menu.d?.length) return { found: false, drinks: [] };
  const found = (ask.lastSources || []).slice(0, 2).map((w) => ({ uri: w.uri, title: (w.title || "google").replace(/^www\./, "") }));
  // Google doesn't always say which pages it used: then link to the same search.
  return tidy(menu, found.length ? found : [{ uri: "https://www.google.com/search?q=" + encodeURIComponent(where + " menu"), title: "google search" }]);
}

// image: base64 PNG of the scribble pad. Returns a number 1-10, or null if it can't tell.
export async function readRating(key, image) {
  const out = await ask(key, [
    { text: 'This is a handwritten drink rating, usually like "8/10", "8", or "7.5 out of 10". Reply with ONLY JSON: {"rating": number from 1 to 10, or null if there is no readable number}' },
    { inline_data: { mime_type: "image/png", data: image } },
  ]);
  try {
    const r = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)).rating;
    return r >= 1 && r <= 10 ? Math.round(r) : null;
  } catch { return null; }
}
