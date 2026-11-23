// Anonymous usage counts, so we can see if drekka works for people: how many open it, finish the
// welcome, look up a place, get a menu, pick a drink, save to the journal. Same setup as Trail Prep:
// GoatCounter (dashboard drekka.goatcounter.com) and Google Analytics 4.
// Only the action is sent (like "menu-found" or "pick-rare"). Never place names, drink names,
// locations, notes or photos.
const GA4_ID = "G-4QHGR986MS"; // same Google Analytics property as the portfolio and Trail Prep

if (GA4_ID && location.hostname !== "localhost") {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", GA4_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
}

// track("menu-found") or track("nearby", "boba & tea"). The detail is a word from drekka's own
// lists (a kind of spot, a pick type, a theme), never something a person typed.
export function track(name, detail = "") {
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const path = detail ? `${name}-${slug(detail)}` : name;
  try { window.goatcounter?.count?.({ path, title: path, event: true }); } catch {}
  try { window.gtag?.("event", name.replace(/-/g, "_"), detail ? { app: "drekka", detail: slug(detail) } : { app: "drekka" }); } catch {}
}
