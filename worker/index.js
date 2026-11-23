// drekka's small server (a free Cloudflare Worker, at /api/ next to the app's pages). It holds the AI and Jina keys, so people
// using the app never need their own, and it remembers menus forever so a place found once loads in a
// second for everyone after that (refreshed quietly in the background once a week old).
//   POST /api/menu      { name, address, osm }  -> { found, drinks, sources }
//   POST /api/rating    { image }               -> { rating }   (reads a scribbled "8/10")
//   POST /api/feedback  { ...answers }          -> { ok }       (saved for suhi to read)
//   POST /api/where     {}                      -> { lat, lon }  (rough location, for nearby search results)
//   POST /api/nearby    { kind, lat, lon }      -> { places: [...] | null }  (spots near you with star ratings; null = use the free map)
//   POST /api/places    { q, lat, lon }         -> { places: [{ name, address, gid }] }  (google maps, for spots the free map lacks)
// Keys live in Cloudflare as secrets (GEMINI_KEY, JINA_KEY, PLACES_KEY), never in this code.
import { fetchMenuText } from "../menu.js";
import { readMenu, readRating, readMenuWithGoogle } from "../ai.js";

const ALLOWED = ["https://drekka.pages.dev", "https://drekka.drekka.workers.dev", "https://suhibug.github.io", "http://127.0.0.1:8765", "http://127.0.0.1:8787", "http://localhost:8000"];
// Menus are remembered forever. Once one is a week old, people still get it instantly, but the
// server quietly re-reads the place's menu in the background (free path only) to catch new drinks.
const FRESH_DAYS = 7;
// Tap lists (breweries) change much more often, so they're re-read after 2 days.
const TAP_FRESH_DAYS = 2;
// Brewery-ish names, for when the app doesn't say it's a brewery.
const TAPPY = /brew|taproom|tap room|tap house|taphouse|ale ?house|beer/i;
// Google Search (paid key, GOOGLE_KEY) is the last resort when the free search finds nothing.
// About 1 cent each; suhi's limit is $3 a month, so it stops after this many in a month.
const GOOGLE_PER_MONTH = 250;
// Google Places (PLACES_KEY): only for spots the free map (OpenStreetMap) doesn't know. Google gives
// 5,000 searches and 1,000 website look-ups free each month; these limits stay well under that,
// so it costs $0. Past them, drekka simply stops asking google until next month.
const PLACES_SEARCH_PER_MONTH = 4000;
const PLACES_SITE_PER_MONTH = 800;
// "find one near me": google's nearby list with star ratings. 1,000 free a month; this stops at 800,
// and each area's answer is remembered for a week, so it costs $0. Past the limit, the app uses the free map.
const NEARBY_PER_MONTH = 800;
// What to ask google for each kind of spot in the app.
const NEARBY_WORDS = {
  "café": "coffee shop cafe", "boba & tea": "boba bubble tea", "juice & smoothies": "juice smoothie bar",
  "dessert & shakes": "dessert milkshake ice cream", bar: "cocktail bar", brewery: "brewery taproom",
  restaurant: "restaurant", "surprise me": "cafe bar drinks",
};
// The free ai allows 500 a day; refreshes may use at most this many, leaving the rest for people.
const REFRESH_PER_DAY = 100;

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

// Uses one paid lookup from this month's allowance, if there's a paid key and some left.
async function spend(env) {
  if (!env.GOOGLE_KEY) return false;
  const month = "google:" + new Date().toISOString().slice(0, 7);
  const used = +(await env.DREKKA.get(month)) || 0;
  if (used >= GOOGLE_PER_MONTH) return false;
  await env.DREKKA.put(month, String(used + 1), { expirationTtl: 40 * 86400 });
  return true;
}

// Counts one use against a monthly limit; false once the limit is reached.
async function within(env, name, limit) {
  const month = name + ":" + new Date().toISOString().slice(0, 7);
  const used = +(await env.DREKKA.get(month)) || 0;
  if (used >= limit) return false;
  await env.DREKKA.put(month, String(used + 1), { expirationTtl: 40 * 86400 });
  return true;
}

// Places google maps knows by this name, nearby ones first. Same search answered from memory for 30 days.
async function googlePlaces(env, q, lat, lon) {
  if (!env.PLACES_KEY || q.length < 3) return [];
  const near = lat && lon ? `${(+lat).toFixed(1)},${(+lon).toFixed(1)}` : "";
  const key = "places:" + q.toLowerCase() + "|" + near;
  const kept = await env.DREKKA.get(key, "json");
  if (kept) return kept;
  if (!(await within(env, "places-search", PLACES_SEARCH_PER_MONTH))) return [];
  const body = { textQuery: q, pageSize: 6 };
  if (near) body.locationBias = { circle: { center: { latitude: +lat, longitude: +lon }, radius: 40000 } };
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.PLACES_KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const places = ((await res.json()).places || []).map((p) => ({ name: p.displayName?.text || "", address: p.formattedAddress || "", gid: p.id })).filter((p) => p.name);
  await env.DREKKA.put(key, JSON.stringify(places), { expirationTtl: 30 * 86400 });
  return places;
}

// Spots of one kind near a point, with their star rating and website (so the menu can be read).
async function googleNearby(env, kind, lat, lon) {
  const words = NEARBY_WORDS[kind];
  if (!env.PLACES_KEY || !words || !isFinite(lat) || !isFinite(lon)) return null;
  const key = `nearby:${kind}|${(+lat).toFixed(2)},${(+lon).toFixed(2)}`; // about a 1 km square
  const kept = await env.DREKKA.get(key, "json");
  if (kept) return kept;
  if (!(await within(env, "places-nearby", NEARBY_PER_MONTH))) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.PLACES_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.websiteUri,places.primaryType,places.businessStatus" },
    body: JSON.stringify({ textQuery: words, pageSize: 20, locationBias: { circle: { center: { latitude: +lat, longitude: +lon }, radius: 3000 } } }),
  });
  if (!res.ok) return null;
  const places = ((await res.json()).places || [])
    .filter((p) => p.displayName?.text && p.location && (!p.businessStatus || p.businessStatus === "OPERATIONAL"))
    .map((p) => ({ name: p.displayName.text, address: p.formattedAddress || "", gid: p.id, lat: p.location.latitude, lon: p.location.longitude,
      rating: p.rating || null, reviews: p.userRatingCount || 0, site: p.websiteUri || "", tap: /brew/.test(p.primaryType || "") }));
  await env.DREKKA.put(key, JSON.stringify(places), { expirationTtl: 7 * 86400 });
  return places;
}

// A google place's own website (kept forever once known), so the menu can be read from the source.
async function googleWebsite(env, gid) {
  if (!env.PLACES_KEY || !/^[\w-]{10,300}$/.test(gid)) return null;
  const key = "site:" + gid;
  const kept = await env.DREKKA.get(key);
  if (kept !== null) return kept || null;
  if (!(await within(env, "places-site", PLACES_SITE_PER_MONTH))) return null;
  const res = await fetch("https://places.googleapis.com/v1/places/" + gid, { headers: { "X-Goog-Api-Key": env.PLACES_KEY, "X-Goog-FieldMask": "websiteUri" } });
  if (!res.ok) return null;
  const site = (await res.json()).websiteUri || "";
  await env.DREKKA.put(key, site);
  return site || null;
}

// The free way: the place's website or web search, read by the free ai. If the free ai is busy
// (too many people at once), the paid key reads the same pages instead (counted like a google lookup),
// so people aren't told to wait. canPay = false for background refreshes, which never spend money.
async function freeMenu(env, place, canPay = true) {
  if (place.gid && !place.osm && !place.site) place.site = await googleWebsite(env, place.gid).catch(() => null);
  const got = await fetchMenuText(place, { jinaKey: env.JINA_KEY });
  if (!got) return { found: false, drinks: [] };
  try { return await readMenu(env.GEMINI_KEY, place, got.pages); }
  catch (err) {
    if (err.busy && canPay && (await spend(env))) return readMenu(env.GOOGLE_KEY, place, got.pages).catch(() => ({ found: false, drinks: [] }));
    if (err.busy) throw err;
    return { found: false, drinks: [] };
  }
}

// Google Search, but only while this month's allowance lasts.
async function lastResort(env, place) {
  if (!(await spend(env))) return { found: false, drinks: [] };
  return readMenuWithGoogle(env.GOOGLE_KEY, place).catch(() => ({ found: false, drinks: [] }));
}

// Background refreshes get a daily limit, so they never use up the free ai that people need.
async function mayRefresh(env) {
  const day = "refresh:" + new Date().toISOString().slice(0, 10);
  const done = +(await env.DREKKA.get(day)) || 0;
  if (done >= REFRESH_PER_DAY) return false;
  await env.DREKKA.put(day, String(done + 1), { expirationTtl: 2 * 86400 });
  return true;
}

export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname.replace(/^\/api/, "");
    if (!new URL(req.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(req); // the app's pages
    const origin = req.headers.get("Origin") || "";
    if (req.method === "OPTIONS") return reply({}, origin);
    if (req.method !== "POST" || !ALLOWED.includes(origin)) return reply({ error: "not allowed" }, origin, 403);
    let input;
    try { input = await req.json(); } catch { return reply({ error: "bad request" }, origin, 400); }

    try {
      if (path === "/menu") {
        const place = { name: String(input.name || "").slice(0, 120), address: String(input.address || "").slice(0, 200), osm: String(input.osm || "").slice(0, 30), gid: String(input.gid || "").slice(0, 300) };
        // The place's website, when the app already knows it (from the map's "near me" list). Must be a plain web address.
        const site = String(input.site || "").slice(0, 300);
        if (/^https?:\/\/[^\s"'<>]+$/.test(site)) place.site = site;
        place.tap = input.tap === true || TAPPY.test(place.name);
        if (!place.name) return reply({ error: "no place" }, origin, 400);
        const cacheKey = "menu:" + (place.osm || place.gid || `${place.name}|${place.address}`).toLowerCase();
        // Full menus are kept forever. Thin ones (under 5 drinks) are kept 3 days, then looked up fresh.
        const save = (menu) => env.DREKKA.put(cacheKey, JSON.stringify({ ...menu, tap: place.tap || undefined, savedAt: Date.now() }), menu.drinks.length < 5 ? { expirationTtl: 3 * 86400 } : {});
        const cached = await env.DREKKA.get(cacheKey, "json");
        if (cached) {
          if (Date.now() - (cached.savedAt || 0) > (place.tap ? TAP_FRESH_DAYS : FRESH_DAYS) * 86400000) {
            // If the re-read finds nothing (site down, or it came from google), the old menu stays.
            ctx.waitUntil(mayRefresh(env).then((ok) => ok && freeMenu(env, place, false)).then((menu) => menu?.found && save(menu)).catch(() => {}));
          }
          return reply({ ...cached, cached: true }, origin);
        }
        // early = a head start while the person is still on the search screen: free sources only.
        const early = input.early === true;
        let menu = await freeMenu(env, place, !early);
        // A menu with under 5 drinks is too thin to pick from (delivery sites often show just a few):
        // a real tap tries google too and keeps whichever found more; an early look just says "not yet".
        const thin = (m) => !m.found || m.drinks.length < 5;
        if (thin(menu) && early) return reply({ found: false, drinks: [] }, origin);
        if (thin(menu)) {
          const more = await lastResort(env, place);
          if (more.found && more.drinks.length > (menu.found ? menu.drinks.length : 0)) menu = more;
        }
        if (menu.found) await save(menu);
        return reply({ ...menu, tap: place.tap || undefined }, origin);
      }
      // Roughly where the person is (city level, from their internet connection; no permission
      // needed), so the place search can show nearby spots first.
      if (path === "/where") return reply({ lat: req.cf?.latitude || null, lon: req.cf?.longitude || null }, origin);
      if (path === "/places") {
        const places = await googlePlaces(env, String(input.q || "").trim().slice(0, 120), input.lat, input.lon).catch(() => []);
        return reply({ places }, origin);
      }
      if (path === "/nearby") {
        const places = await googleNearby(env, String(input.kind || ""), input.lat, input.lon).catch(() => null);
        return reply({ places }, origin);
      }
      if (path === "/rating") {
        const image = String(input.image || "");
        if (!image || image.length > 400000) return reply({ rating: null }, origin);
        const rating = await readRating(env.GEMINI_KEY, image).catch(async (err) => {
          if (err.busy && (await spend(env))) return readRating(env.GOOGLE_KEY, image);
          throw err;
        });
        return reply({ rating }, origin);
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
