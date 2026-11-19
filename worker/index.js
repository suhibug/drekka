// drekka's small server (a free Cloudflare Worker). It holds the AI and Jina keys, so people
// using the app never need their own, and it remembers menus so a place found once loads in a
// second for everyone after that.
//   POST /menu      { name, address, osm }  -> { found, drinks, sources }
//   POST /rating    { image }               -> { rating }   (reads a scribbled "8/10")
//   POST /feedback  { ...answers }          -> { ok }       (saved for suhi to read)
// Keys live in Cloudflare as secrets (GEMINI_KEY, JINA_KEY), never in this code.
import { fetchMenuText } from "../menu.js";
import { readMenu, readRating } from "../ai.js";

const ALLOWED = ["https://suhibug.github.io", "http://127.0.0.1:8765", "http://localhost:8000"];
const MENU_DAYS = 3; // menus change, so remembered menus expire after a few days

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

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") return reply({}, origin);
    if (req.method !== "POST" || !ALLOWED.includes(origin)) return reply({ error: "not allowed" }, origin, 403);
    const path = new URL(req.url).pathname;
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
        if (!got) return reply({ found: false, drinks: [] }, origin);
        const menu = await readMenu(env.GEMINI_KEY, place, got.pages);
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
