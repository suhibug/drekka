// Picks: chooses 3 drinks from a menu. Pure logic, no screen code.
//   1. rare       - the rarest drink here that still fits you
//   2. match      - leans toward your quiz answers and the flavors you rated high
//      signature  - the place's signature (if we know nothing about your taste yet)
//   3. wild card  - a rare drink outside your usual taste, on purpose
// (app.js adds a 4th, "steal": the best fit among the menu's lower prices.)

// What you like: flavor -> score (positive = you like it). Starts from the welcome quiz
// (prefs, see quiz.js profileFrom) and keeps learning from every rating in your journal.
export function tasteProfile(entries, prefs) {
  const score = { ...(prefs?.loves || {}) };
  for (const e of entries) {
    if (!e.rating || !e.flavors) continue;
    const w = (e.rating - 5.5) / 4.5; // 10 -> +1, 1 -> -1
    for (const f of e.flavors) score[f] = (score[f] || 0) + w;
  }
  return score;
}

const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// How much a drink fits you: its flavors, plus words from your quiz answers in its name
// (e.g. "matcha", "cold brew"), so it matches the kinds of drinks you said you like.
function likes(drink, profile, words = []) {
  const text = `${drink.name} ${drink.description || ""}`.toLowerCase();
  const byWord = words.filter((w) => text.includes(w)).length * 0.8;
  return (drink.flavors || []).reduce((sum, f) => sum + (profile[f] || 0), 0) + byWord;
}

// The drink you loved most at this place before, if any (rated 8 or more).
export function favoriteHere(entries, placeName) {
  const here = entries.filter((e) => key(e.placeName) === key(placeName) && e.rating >= 8);
  return here.sort((a, b) => b.rating - a.rating)[0] || null;
}

// drinks: [{ name, uniqueness, flavors, popular, seasonal }]
// chosen: flavor chips the person tapped (empty = any)
// skip:   drink names already shown, so "show me more" gives new ones
export function pickThree(drinks, entries, placeName, chosen = [], skip = [], prefs = null) {
  const profile = tasteProfile(entries, prefs);
  const hasTaste = Object.keys(profile).length > 0;
  const words = prefs?.words || [];
  const adventure = prefs?.adventure ?? 0.35; // how much rarity counts in "your_type"
  const triedHere = new Set(entries.filter((e) => key(e.placeName) === key(placeName)).map((e) => key(e.drinkName)));
  const skipped = new Set(skip.map(key));

  // Hard no's are never picked: not even as the rare one or the wild card.
  const noF = prefs?.noFlavors || [], noW = prefs?.noWords || [];
  const hardNo = (d) => (prefs?.noAlcohol && d.alcohol) || (d.flavors || []).some((f) => noF.includes(f)) ||
    noW.some((w) => `${d.name} ${d.description || ""}`.toLowerCase().includes(w));
  let pool = drinks.filter((d) => !skipped.has(key(d.name)) && !hardNo(d));
  if (chosen.length) pool = pool.filter((d) => (d.flavors || []).some((f) => chosen.includes(f)));
  // Drinks you haven't tried here come first; tried ones only if nothing else is left.
  const fresh = pool.filter((d) => !triedHere.has(key(d.name)));
  if (fresh.length >= 3) pool = fresh;

  const best = (list, scoreOf) => list.slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const taken = new Set();
  const take = (d) => { if (d) taken.add(d.name); return d; };
  const left = () => pool.filter((d) => !taken.has(d.name));

  // The rare one: the rarest drink that still fits you (skips drinks your taste leans against).
  const fits = hasTaste ? left().filter((d) => likes(d, profile, words) >= 0) : left();
  const unique = take(best(fits.length ? fits : left(), (d) => d.uniqueness + (d.seasonal ? 0.5 : 0) + (d.popular ? 0.2 : 0)
    + (hasTaste ? Math.min(likes(d, profile, words), 3) * 0.5 : 0)));
  const forYou = take(best(left(), (d) => hasTaste
    ? likes(d, profile, words) * 2 + d.uniqueness * adventure + (d.popular ? 1 : 0)
    : (d.popular ? 3 : 0) + d.uniqueness * 0.5 + (d.seasonal ? 0.5 : 0)));
  // Surprise: rare and not your usual. A little randomness so it changes each time.
  const outside = left().filter((d) => !hasTaste || likes(d, profile, words) <= 0);
  const surprise = take(best(outside.length ? outside : left(), (d) => d.uniqueness + Math.random() * 2.5));

  return [
    unique && { kind: "unique", label: "rare", drink: unique },
    forYou && { kind: "forYou", label: hasTaste ? "match" : "signature", drink: forYou },
    surprise && { kind: "surprise", label: "wild card", drink: surprise },
  ].filter(Boolean);
}

// The flavor chips worth showing for this menu: the most common ones first.
export function flavorChips(drinks, max = 12) {
  const count = {};
  for (const d of drinks) for (const f of d.flavors || []) count[f] = (count[f] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, max).map(([f]) => f);
}
