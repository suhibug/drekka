// Menu reading with Google's Gemini AI (free tier). It gets the text of the place's menu pages
// (found by menu.js) and returns the drinks as a list with a uniqueness score and flavors.
// The AI key is stored only on this device (Settings), never in the code.
// Note: on a public release the key should move to a small server so people don't need their own.

// Google retires old models often, so try a few in order and remember the first one that answers.
// Free tier (Nov 2026): Gemini 3.5 Flash Lite, 15 a minute and 500 a day. (Web search isn't free
// for Gemini 3 and newer, which is why menu.js finds and reads the menu pages itself.)
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"];

const FORMAT = `Return ONLY JSON, no other text:
{"found": true, "menuNote": "where the menu came from, one short line",
 "drinks": [{"name": "", "description": "short, plain words", "price": "$6.50 or empty",
   "uniqueness": 1-10, "why": "one short line: what makes it special, or why it's common",
   "flavors": ["2 to 4 single lowercase words, e.g. coconut, kiwi, mango, floral, smoky, spicy, chocolate, coffee, tea, citrus, creamy, sour, nutty, herbal, caramel"],
   "popular": true or false, "seasonal": true or false, "alcohol": true or false}]}
Uniqueness: 1 = you can get it almost anywhere (chocolate shake, iced latte, plain cola).
10 = rare: only here, or a very unusual combination. Be honest and spread the scores out.
"popular": true if the menu marks it as a favorite, best seller or signature.
Include every drink, up to 50. Leave out food. If the same drink appears twice, list it once.`;

// The reader adds a list of links at the end of each page; the AI doesn't need it.
const clean = (t) => t.replace(/\n(Links\/Buttons|Images):[\s\S]*$/, "").replace(/\n{3,}/g, "\n\n");

// place: { name, address }. pages: [{ url, text }] from menu.js
export async function readMenu(key, place, pages) {
  let budget = 45000;
  const text = pages.map((p) => {
    const t = clean(p.text).slice(0, Math.max(0, budget));
    budget -= t.length;
    return `--- page: ${p.url}\n${t}`;
  }).join("\n\n");
  const where = `${place.name}${place.address ? ", " + place.address : ""}`;
  const prompt = `Below is the text of the website menu pages for ${where}. List the drinks on them. Only include drinks that are actually written in this text; never invent any. If there are no drinks in it, return {"found": false}.\n${FORMAT}\n\n${text}`;
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } };

  let res;
  const saved = localStorage.getItem("drekka-model");
  for (const model of saved ? [saved, ...MODELS.filter((m) => m !== saved)] : MODELS) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    // 404 = model retired, 503 = model busy: try the next one.
    if (res.status !== 404 && res.status !== 503) { if (res.ok) localStorage.setItem("drekka-model", model); break; }
  }
  if (res.status === 404 || res.status === 503) throw new Error("google's ai is busy right now. try again in a minute.");
  if (res.status === 429) throw new Error("that's a lot of searches at once. wait a minute and try again.");
  if (res.status === 400 || res.status === 403) throw new Error("the ai key didn't work. check it in settings.");
  if (!res.ok) throw new Error("the ai didn't answer (" + res.status + "). try again in a minute.");

  const data = await res.json();
  const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  let menu;
  try { menu = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)); }
  catch { throw new Error("couldn't read the menu this time. try again."); }
  if (!menu.found || !menu.drinks?.length) return { found: false, drinks: [] };

  menu.drinks = menu.drinks.map((d) => ({
    ...d,
    uniqueness: Math.max(1, Math.min(10, Math.round(+d.uniqueness || 5))),
    flavors: (d.flavors || []).map((f) => String(f).toLowerCase().trim()).filter(Boolean).slice(0, 4),
  }));
  menu.sources = pages.slice(1).map((p) => ({ uri: p.url, title: new URL(p.url).hostname.replace(/^www\./, "") })).slice(0, 2);
  return menu;
}
