// "No place in mind?" Finds real spots near you, so you can pick one or let drekka choose.
// First from drekka's server (google's list, with star ratings: the best-loved nearby spots come
// first). If that's not available, from OpenStreetMap's free place data (Overpass), closest first.
// Places with their own website get a little boost, because drekka can read their menu.

// Each kind of spot, and the map tags that mean it.
export const KINDS = [
  { t: "café", tags: ['["amenity"="cafe"]'] },
  { t: "boba & tea", tags: ['["amenity"="cafe"]["cuisine"~"bubble_tea|tea",i]', '["shop"="tea"]'] },
  { t: "juice & smoothies", tags: ['["cuisine"~"juice|smoothie",i]', '["shop"="beverages"]'] },
  { t: "dessert & shakes", tags: ['["amenity"="ice_cream"]', '["cuisine"~"dessert|ice_cream|frozen_yogurt|milkshake",i]'] },
  { t: "bar", tags: ['["amenity"~"^(bar|pub)$"]'] },
  { t: "brewery", tags: ['["craft"="brewery"]', '["microbrewery"="yes"]', '["amenity"~"^(pub|bar|restaurant)$"]["brewery"]'], tap: true },
  { t: "restaurant", tags: ['["amenity"="restaurant"]'] },
  { t: "surprise me", tags: ['["amenity"~"^(cafe|bar|pub|ice_cream)$"]', '["craft"="brewery"]'] },
];

const SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

// Where you are: the phone's location (asks permission once), or the rough city-level guess.
export function whereAmI(rough) {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(rough);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, exact: true }),
      () => ok(rough), // said no, or no signal: use the rough guess
      { timeout: 9000, maximumAge: 10 * 60000 },
    );
  });
}

const miles = /^en-(us|gb)/i.test(navigator.language || "");
function distance(a, b) {
  const r = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h)); // km
}
export const howFar = (km) => (miles ? `${(km / 1.609).toFixed(1)} mi` : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

async function ask(query) {
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query), signal: AbortSignal.timeout(15000) });
      if (res.ok) return (await res.json()).elements || [];
    } catch { /* try the other server */ }
  }
  throw new Error("couldn't reach the map right now. try again in a minute.");
}

// How good a spot is: its star rating, steadied by how many reviews it has (a 5.0 from 3 people
// counts less than a 4.7 from 900), minus a little for every km away.
function score(p) {
  const stars = p.rating ? (p.rating * p.reviews + 4.2 * 25) / (p.reviews + 25) : 3.9;
  return stars - 0.12 * p.km + (p.site ? 0.08 : 0);
}

export async function findNearby(kind, at, api) {
  if (api) {
    try {
      const res = await fetch(api + "/nearby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: kind.t, lat: at.lat, lon: at.lon }) });
      const got = (await res.json()).places;
      if (got?.length) {
        const places = got.map((p) => ({ ...p, km: distance(at, p), tap: p.tap || !!kind.tap, osm: "" })).filter((p) => p.km < 12);
        places.sort((a, b) => score(b) - score(a));
        if (places.length) return places.slice(0, 10);
      }
    } catch { /* server busy: use the free map */ }
  }
  return fromMap(kind, at);
}

// The free map: closest first (places with a website a little ahead).
// Looks 2 km around you, then 8 km if that finds fewer than 4.
async function fromMap(kind, at) {
  for (const radius of [2000, 8000]) {
    const parts = kind.tags.map((t) => `nwr${t}["name"](around:${radius},${at.lat},${at.lon});`).join("");
    const found = await ask(`[out:json][timeout:12];(${parts});out tags center 80;`);
    const seen = new Set();
    const places = found.map((e) => {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, tg = e.tags || {};
      if (lat == null || !tg.name) return null;
      const site = tg["website:menu"] || tg.website || tg["contact:website"] || "";
      return {
        name: tg.name,
        address: [[tg["addr:housenumber"], tg["addr:street"]].filter(Boolean).join(" "), tg["addr:city"]].filter(Boolean).join(", "),
        osm: { node: "N", way: "W", relation: "R" }[e.type] + e.id,
        site: site && (site.startsWith("http") ? site : "https://" + site),
        km: distance(at, { lat, lon }),
        tap: !!kind.tap || tg.craft === "brewery" || tg.microbrewery === "yes",
      };
    }).filter((p) => p && !seen.has(p.name.toLowerCase()) && seen.add(p.name.toLowerCase()));
    // A website is worth about half a kilometer: those menus can actually be read.
    places.sort((a, b) => (a.km - (a.site ? 0.5 : 0)) - (b.km - (b.site ? 0.5 : 0)));
    if (places.length >= 4 || radius === 8000) return places.slice(0, 10);
  }
  return [];
}

// "you choose for me": a random one of the closest few that have a website.
export function chooseFor(places) {
  const good = places.filter((p) => p.site && (!p.rating || p.rating >= 4.2)).slice(0, 5);
  const from = good.length ? good : places.slice(0, 5);
  return from[Math.floor(Math.random() * from.length)];
}
