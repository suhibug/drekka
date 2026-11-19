// Finds a place's drink menu on the web, with no photo:
//   1. OpenStreetMap knows most places' websites (for chains: brand -> Wikidata -> official site)
//   2. Jina Reader opens the site like a real browser (it runs the page's JavaScript) and gives back text
//   3. We read the home page and /menu at the same time, then other menu or drinks links if needed
//   4. No website, or no drinks on it? Search the web for "<place> <city> drink menu" (Jina search)
// The text then goes to the AI (ai.js) to pick out the drinks.
// Runs in the browser or on the drekka server (worker/), so keys are passed in, never stored here.

const READER = "https://r.jina.ai/";
// OpenStreetMap and Wikidata ask apps to say who they are, or they may refuse the request.
const WHO = { "User-Agent": "drekka/1.0 (https://github.com/suhibug/drekka)" };
const SEARCH = "https://s.jina.ai/?q=";
const MENU_WORDS = /menu|drink|beverage|bev\b|coffee|tea|cocktail|bar\b|smoothie|shake|boba|juice|soda/i;
const DRINK_LINK = /drink|bev|coffee|tea|cocktail/i;
const SKIP = /\.(png|jpe?g|gif|webp|svg|ico|css|js)(\?|$)|instagram|facebook|tiktok|twitter|x\.com|yelp|google\.|maps|mailto:|tel:|careers|jobs|privacy|terms|login|cart|gift/i;
// Words that show a page really lists drinks.
const DRINKY = /latte|espresso|coffee|matcha|tea\b|chai|lemonade|soda|smoothie|juice|cocktail|mocktail|mojito|margarita|boba|refresher|cold brew|shake|spritz|sangria|frapp|dr pepper|coke|sprite|puree|syrup|lassi|falooda|buttermilk|horchata|agua fresca/gi;
// Food apps whose pages hide menus behind pictures or sign-ins: still searched, but read last.
const WALLED = /zomato|swiggy|district\.in|ubereats|doordash|grubhub|postmates|toasttab/;

// The place's website from OpenStreetMap. place.osm = "N123" / "W123" / "R123" from the search result.
export async function findWebsite(place) {
  if (!place.osm) return null;
  const type = { N: "node", W: "way", R: "relation" }[place.osm[0]];
  try {
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/${type}/${place.osm.slice(1)}.json`, { headers: WHO });
    const tags = (await res.json()).elements?.[0]?.tags || {};
    const site = tags["website:menu"] || tags.website || tags["contact:website"] || tags["brand:website"];
    if (site) return site.startsWith("http") ? site : "https://" + site;
    if (tags["brand:wikidata"]) return await brandWebsite(tags["brand:wikidata"]);
  } catch { /* fall through */ }
  return null;
}

// Chains: Wikidata lists the brand's official website (property P856).
async function brandWebsite(qid) {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { headers: WHO });
  const claims = (await res.json()).entities?.[qid]?.claims?.P856;
  return claims?.[0]?.mainsnak?.datavalue?.value || null;
}

// Read one page as text (plus the links on it). With a jina key it can also read menus
// hidden inside frames (like swig's).
async function read(url, jinaKey) {
  const extra = jinaKey ? { Authorization: "Bearer " + jinaKey, "X-With-Iframe": "true", "X-With-Shadow-Dom": "true" } : {};
  const res = await fetch(READER + url, {
    headers: { "X-With-Links-Summary": "true", "X-Retain-Images": "none", "X-Timeout": "15", ...extra },
    signal: AbortSignal.timeout(25000),
  });
  // 401/402/403 with a key = its balance ran out: the reader still works without one (just slower).
  if (jinaKey && [401, 402, 403].includes(res.status)) return read(url, "");
  if (!res.ok) throw new Error("reader " + res.status);
  return res.text();
}

const drinkiness = (text) => (text.match(DRINKY) || []).length;

function links(text, site) {
  const host = new URL(site).hostname.replace(/^www\./, "");
  const found = new Set();
  for (const [, label, url] of text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (SKIP.test(url)) continue;
    let u; try { u = new URL(url); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    // Look only at the page path and the link's words (not the domain, which may contain "tea" etc.)
    if (MENU_WORDS.test(u.pathname + u.search) || MENU_WORDS.test(label)) found.add(u.href.replace(/#.*$/, ""));
  }
  // Drink pages first, then general menu pages.
  return [...found].sort((a, b) => (DRINK_LINK.test(b) ? 1 : 0) - (DRINK_LINK.test(a) ? 1 : 0));
}

// Read the place's own website. Returns pages.
async function fromWebsite(site, jinaKey) {
  const pages = [];
  const guess = new URL(site).origin + "/menu";
  const [homeR, guessR] = await Promise.allSettled([read(site, jinaKey), guess === site ? Promise.reject() : read(guess, jinaKey)]);
  if (homeR.status === "fulfilled") pages.push({ url: site, text: homeR.value });
  if (guessR.status === "fulfilled" && !/404|not found/i.test(guessR.value.slice(0, 400))) pages.push({ url: guess, text: guessR.value });
  if (!pages.length) return pages;
  const enough = () => Math.max(...pages.map((p) => drinkiness(p.text))) >= 12;
  // Only dig deeper if we don't have a real drinks list yet (saves time).
  for (let hop = 0; hop < 2 && !enough(); hop++) {
    const next = pages.flatMap((p) => links(p.text, site))
      .filter((u, i, all) => all.indexOf(u) === i && !pages.some((p) => p.url === u))
      .filter((u) => hop === 0 || DRINK_LINK.test(new URL(u).pathname + new URL(u).search))
      .slice(0, 2);
    if (!next.length) break;
    const got = await Promise.allSettled(next.map((u) => read(u, jinaKey)));
    got.forEach((r, i) => { if (r.status === "fulfilled") pages.push({ url: next[i], text: r.value }); });
  }
  return pages;
}

// A search result only counts if it clearly names this place: every distinctive word of the
// name must appear in it (so "zzqx tea hut" never matches some other "tea hut").
const GENERIC = new Set(["the", "and", "cafe", "café", "coffee", "tea", "bar", "restaurant", "house", "kitchen", "shop", "lounge", "co", "company", "eatery", "grill", "bistro", "drinks"]);
const plain = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function namesPlace(page, name) {
  const words = plain(name).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC.has(w));
  const hay = plain(page.url + " " + page.text).replace(/[^a-z0-9]+/g, " ");
  const need = words.length ? words : [plain(name)];
  return need.every((w) => hay.includes(w) || hay.includes(w.replace(/s$/, "")));
}

// Search the web for the menu (needs a jina key). Two searches at once, worded differently; then
// the most promising results are opened in full, since search results only carry a slice of each page.
async function fromSearch(place, jinaKey) {
  const city = (place.address || "").split(",").map((s) => s.trim()).filter((s) => !/^\d/.test(s))[1] || "";
  const ask = async (q) => {
    const res = await fetch(SEARCH + encodeURIComponent(q), {
      headers: { Authorization: "Bearer " + jinaKey, "X-Retain-Images": "none" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return [];
    // Split into results: "[1] Title: ... [1] URL Source: ... [1] Markdown Content: ..."
    return (await res.text()).split(/\n(?=\[\d+\] Title:)/).map((chunk) => {
      const url = chunk.match(/\[\d+\] URL Source: (\S+)/)?.[1];
      return url && !/facebook|instagram|tiktok|pinterest|youtube/.test(url) ? { url, text: chunk.slice(0, 15000) } : null;
    }).filter(Boolean);
  };
  const found = (await Promise.allSettled([ask(`${place.name} ${city} menu`), ask(`${place.name} ${city} drinks beverages menu`)]))
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((p, i, all) => all.findIndex((x) => x.url === p.url) === i)
    .filter((p) => namesPlace(p, place.name));
  // Open the best open (not walled) results in full.
  const open = found.filter((p) => !WALLED.test(p.url)).sort((a, b) => drinkiness(b.text) - drinkiness(a.text)).slice(0, 3);
  const full = await Promise.allSettled(open.map((p) => read(p.url, jinaKey)));
  full.forEach((r, i) => { if (r.status === "fulfilled" && r.value.length > open[i].text.length) open[i].text = r.value.slice(0, 20000); });
  return [...open, ...found.filter((p) => !open.includes(p))]
    .sort((a, b) => drinkiness(b.text) - drinkiness(a.text)).slice(0, 5);
}

// Returns { site, pages: [{ url, text }] } (most drink-filled page first) or null if nothing was found.
export async function fetchMenuText(place, { jinaKey = "" } = {}) {
  const site = await findWebsite(place);
  let pages = site ? await fromWebsite(site, jinaKey).catch(() => []) : [];
  const best = pages.length ? Math.max(...pages.map((p) => drinkiness(p.text))) : 0;
  pages.sort((a, b) => drinkiness(b.text) - drinkiness(a.text));
  // No website, or no real drinks on it: add web search results, after the official pages
  // (they're the most accurate). Search is the slow step, so only when it's needed.
  if (best < 4 && jinaKey) {
    const found = await fromSearch(place, jinaKey).catch(() => []);
    const official = (u) => site && new URL(u).hostname.replace(/^www\./, "") === new URL(site).hostname.replace(/^www\./, "");
    pages = [...pages, ...found.filter((p) => official(p.url)), ...found.filter((p) => !official(p.url))]
      .filter((p, i, all) => all.findIndex((x) => x.url === p.url) === i);
  }
  return pages.length ? { site, pages } : null;
}
