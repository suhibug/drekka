// Finds a place's drink menu on the web, for free, with no photo:
//   1. OpenStreetMap knows most places' websites (or, for chains, the brand -> Wikidata -> official site)
//   2. Jina Reader opens the site like a real browser (it runs the page's JavaScript) and gives back text
//   3. We follow the links that look like a menu or drinks page and collect their text
// The text then goes to the AI (ai.js) to pick out the drinks.

const READER = "https://r.jina.ai/";
const MENU_WORDS = /menu|drink|beverage|bev\b|coffee|tea|cocktail|bar\b|smoothie|shake|boba|juice|soda/i;
const SKIP = /\.(png|jpe?g|gif|webp|svg|ico|css|js)(\?|$)|instagram|facebook|tiktok|twitter|x\.com|yelp|google\.|maps|mailto:|tel:|careers|jobs|privacy|terms|login|cart|gift/i;

// The place's website from OpenStreetMap. place.osm = "N123" / "W123" / "R123" from the search result.
export async function findWebsite(place) {
  if (!place.osm) return null;
  const type = { N: "node", W: "way", R: "relation" }[place.osm[0]];
  try {
    const res = await fetch(`https://api.openstreetmap.org/api/0.6/${type}/${place.osm.slice(1)}.json`);
    const tags = (await res.json()).elements?.[0]?.tags || {};
    const site = tags["website:menu"] || tags.website || tags["contact:website"] || tags["brand:website"];
    if (site) return site.startsWith("http") ? site : "https://" + site;
    if (tags["brand:wikidata"]) return await brandWebsite(tags["brand:wikidata"]);
  } catch { /* fall through */ }
  return null;
}

// Chains: Wikidata lists the brand's official website (property P856).
async function brandWebsite(qid) {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const claims = (await res.json()).entities?.[qid]?.claims?.P856;
  return claims?.[0]?.mainsnak?.datavalue?.value || null;
}

// Read one page as text (plus the links on it).
async function read(url) {
  const res = await fetch(READER + url, {
    headers: { "X-With-Links-Summary": "true", "X-Retain-Images": "none", "X-Timeout": "15" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error("reader " + res.status);
  return res.text();
}

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
  return [...found].sort((a, b) => (/drink|bev|coffee|tea|cocktail/i.test(b) ? 1 : 0) - (/drink|bev|coffee|tea|cocktail/i.test(a) ? 1 : 0));
}

// Returns { site, pages: [{ url, text }] } or null if nothing readable was found.
export async function fetchMenuText(place) {
  const site = await findWebsite(place);
  if (!site) return null;
  const pages = [];
  // Read the home page and the usual /menu page at the same time (faster).
  const guess = new URL(site).origin + "/menu";
  const [homeR, guessR] = await Promise.allSettled([read(site), guess === site ? Promise.reject() : read(guess)]);
  if (homeR.status === "fulfilled") pages.push({ url: site, text: homeR.value });
  if (guessR.status === "fulfilled" && !/404|not found/i.test(guessR.value.slice(0, 400))) pages.push({ url: guess, text: guessR.value });
  if (!pages.length) return null;
  // Then any other menu-looking links from the home page.
  const toRead = links(pages[0].text, site).filter((u) => !pages.some((p) => p.url === u)).slice(0, 2);
  const results = await Promise.allSettled(toRead.map(read));
  results.forEach((r, i) => { if (r.status === "fulfilled") pages.push({ url: toRead[i], text: r.value }); });
  // One more hop: a menu page often has tabs (e.g. "drinks") as their own links.
  const more = pages.flatMap((p) => links(p.text, site)).filter((u) => !pages.some((p) => p.url === u) && /drink|bev|coffee|tea|cocktail/i.test(new URL(u).pathname + new URL(u).search)).slice(0, 2);
  const extra = await Promise.allSettled(more.map(read));
  extra.forEach((r, i) => { if (r.status === "fulfilled") pages.push({ url: more[i], text: r.value }); });
  return { site, pages };
}
