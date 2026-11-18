// Menu reading with Google's Gemini AI (free tier). It searches the web for the place's
// current drink menu, or reads a photo of the menu, and returns the drinks as a list.
// The AI key is stored only on this device (Settings), never in the code.
// Note: on a public release the key should move to a small server so people don't need their own.

// Google retires old models often, so try a few in order and remember the first one that answers.
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite"];

const FORMAT = `Return ONLY JSON, no other text:
{"found": true, "menuNote": "where the menu came from and how recent it looks, one short line",
 "drinks": [{"name": "", "description": "short, plain words", "price": "$6.50 or empty",
   "uniqueness": 1-10, "why": "one short line: what makes it special, or why it's common",
   "flavors": ["2 to 4 single lowercase words, e.g. coconut, kiwi, mango, floral, smoky, spicy, chocolate, coffee, tea, citrus, creamy, sour, nutty, herbal, caramel"],
   "popular": true or false, "seasonal": true or false}]}
Uniqueness: 1 = you can get it almost anywhere (chocolate shake, iced latte, plain cola).
10 = rare: only here, or a very unusual combination. Be honest and spread the scores out.
Include every drink you find, up to 40. Leave out food.`;

function prompt(place, fromPhoto) {
  const where = `${place.name}${place.address ? ", " + place.address : ""}`;
  return fromPhoto
    ? `This is a photo of the menu at ${where}. List the drinks on it. Only include drinks you can read in the photo; never invent any. If there are no drinks, return {"found": false}.\n${FORMAT}`
    : `Find the CURRENT drink menu for this exact place: ${where}. Check the official website, online ordering pages (Toast, Square, DoorDash, Uber Eats), and recent posts. Only include drinks you actually found for this place; never invent any. If you cannot find its menu, return {"found": false}.\n${FORMAT}`;
}

// place: { name, address }. photo (optional): { type, base64 }
export async function readMenu(key, place, photo) {
  const parts = [{ text: prompt(place, !!photo) }];
  if (photo) parts.push({ inline_data: { mime_type: photo.type, data: photo.base64 } });
  const body = { contents: [{ role: "user", parts }] };
  if (!photo) body.tools = [{ google_search: {} }];

  let res;
  const saved = localStorage.getItem("drekka-model");
  for (const model of saved ? [saved, ...MODELS.filter((m) => m !== saved)] : MODELS) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.status !== 404) { if (res.ok) localStorage.setItem("drekka-model", model); break; }
  }
  if (res.status === 404) throw new Error("Google's AI isn't answering right now. Try again in a few minutes.");
  if (res.status === 503) throw new Error("Google's AI is busy right now. Try again in a minute.");
  if (res.status === 429) throw new Error("You've used today's free AI searches. Try again tomorrow.");
  if (res.status === 400 || res.status === 403) throw new Error("The AI key didn't work. Check it in Settings.");
  if (!res.ok) throw new Error("The AI didn't answer (" + res.status + "). Try again in a minute.");

  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let menu;
  try { menu = JSON.parse(json); } catch { throw new Error("Couldn't read the menu this time. Try again, or snap a photo of it."); }
  if (!menu.found || !menu.drinks?.length) return { found: false, drinks: [] };

  menu.drinks = menu.drinks.map((d) => ({
    ...d,
    uniqueness: Math.max(1, Math.min(10, Math.round(+d.uniqueness || 5))),
    flavors: (d.flavors || []).map((f) => String(f).toLowerCase().trim()).filter(Boolean).slice(0, 4),
  }));
  // Links the AI used, so people can check the menu themselves.
  menu.sources = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter(Boolean).slice(0, 3);
  return menu;
}
