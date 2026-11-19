// drekka's small server (a free Cloudflare Worker, at /api/ next to the app's pages). It holds the AI and Jina keys, so people
// using the app never need their own, and it remembers menus so a place found once loads in a
// second for everyone after that.
//   POST /api/menu      { name, address, osm }  -> { found, drinks, sources }
//   POST /api/rating    { image }               -> { rating }   (reads a scribbled "8/10")
//   POST /api/feedback  { ...answers }          -> { ok }       (saved for suhi to read)
// Keys live in Cloudflare as secrets (GEMINI_KEY, JINA_KEY), never in this code.
import { fetchMenuText } from "../menu.js";
import { readMenu, readRating, readMenuWithGoogle } from "../ai.js";

const ALLOWED = ["https://drekka.pages.dev", "https://drekka.drekka.workers.dev", "https://suhibug.github.io", "http://127.0.0.1:8765", "http://127.0.0.1:8787", "http://localhost:8000"];
const MENU_DAYS = 3; // menus change, so remembered menus expire after a few days
// Google Search (paid key, GOOGLE_KEY) is the last resort when the free search finds nothing.
// About 1 cent each; suhi's limit is $3 a month, so it stops after this many in a month.
const GOOGLE_PER_MONTH = 250;

function reply(body, origin, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED.includes(origin) ? origin : ALLOWED[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Google, but only while this month's count is under the limit.
async function lastResort(env, place) {
  if (!env.GOOGLE_KEY) return { found: false, drinks: [] };
  const month = "google:" + new Date().toISOString().slice(0, 7);
  const used = +(await env.DREKKA.get(month)) || 0;
  if (used >= GOOGLE_PER_MONTH) return { found: false, drinks: [] };
  await env.DREKKA.put(month, String(used + 1), { expirationTtl: 40 * 86400 });
  return readMenuWithGoogle(env.GOOGLE_KEY, place).catch(() => ({ found: false, drinks: [] }));
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/^\/api/, "");
    if (!new URL(req.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(req); // the app's pages
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") return reply({}, origin);
    if (req.method !== "POST" || !ALLOWED.includes(origin)) return reply({ error: "not allowed" }, origin, 403);
    let input;
    try { input = await req.json(); } catch { return reply({ error: "bad request" }, origin, 400); }

    try {
      if (path === "/menu") {
        const place = { name: String(input.name || "").slice(0, 120), address: String(input.address || "").slice(0, 200), osm: String(input.osm || "").slice(0, 30) };
        if (!place.name) return reply({ error: "no place" }, origin, 400);
        const cacheKey = "menu:" + (place.osm || `${place.name}|${place.address}`).toLowerCase();
        const cached = await env.DREKKA.get(cacheKey, "json");
        if (cached) return reply({ ...cached, cached: true }, origin);
        const got = await fetchMenuText(place, { jinaKey: env.JINA_KEY });
        let menu = got ? await readMenu(env.GEMINI_KEY, place, got.pages).catch(() => ({ found: false, drinks: [] })) : { found: false, drinks: [] };
        if (!menu.found) menu = await lastResort(env, place);
        if (menu.found) await env.DREKKA.put(cacheKey, JSON.stringify(menu), { expirationTtl: MENU_DAYS * 86400 });
        return reply(menu, origin);
      }
      if (path === "/rating") {
        const image = String(input.image || "");
        if (!image || image.length > 400000) return reply({ rating: null }, origin);
        return reply({ rating: await readRating(env.GEMINI_KEY, image) }, origin);
      }
      if (path === "/feedback") {
        const entry = JSON.stringify({ ...input, at: new Date().toISOString() }).slice(0, 4000);
        await env.DREKKA.put(`feedback:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`, entry);
        return reply({ ok: true }, origin);
      }
      return reply({ error: "not found" }, origin, 404);
    } catch (err) {
      return reply({ error: err.message || "something went wrong" }, origin, 502);
    }
  },
};
