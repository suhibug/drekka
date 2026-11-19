// Picks: chooses 3 drinks from a menu. Pure logic, no screen code.
//   1. rare_find   - the rarest drink here
//   2. house_fave  - the place's signature (before you've rated anything)
//      your_type   - leans toward flavors you rated high in your journal
//   3. wild_card   - a rare drink outside your usual taste, on purpose

// What your journal says you like: flavor -> score (positive = you like it).
export function tasteProfile(entries) {
  const score = {};
  for (const e of entries) {
    if (!e.rating || !e.flavors) continue;
    const w = (e.rating - 5.5) / 4.5; // 10 -> +1, 1 -> -1
    for (const f of e.flavors) score[f] = (score[f] || 0) + w;
  }
  return score;
}

const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const likes = (drink, profile) => (drink.flavors || []).reduce((sum, f) => sum + (profile[f] || 0), 0);

// The drink you loved most at this place before, if any (rated 8 or more).
export function favoriteHere(entries, placeName) {
  const here = entries.filter((e) => key(e.placeName) === key(placeName) && e.rating >= 8);
  return here.sort((a, b) => b.rating - a.rating)[0] || null;
}

// drinks: [{ name, uniqueness, flavors, popular, seasonal }]
// chosen: flavor chips the person tapped (empty = any)
// skip:   drink names already shown, so "show me more" gives new ones
export function pickThree(drinks, entries, placeName, chosen = [], skip = []) {
  const profile = tasteProfile(entries);
  const hasTaste = Object.keys(profile).length > 0;
  const triedHere = new Set(entries.filter((e) => key(e.placeName) === key(placeName)).map((e) => key(e.drinkName)));
  const skipped = new Set(skip.map(key));

  let pool = drinks.filter((d) => !skipped.has(key(d.name)));
  if (chosen.length) pool = pool.filter((d) => (d.flavors || []).some((f) => chosen.includes(f)));
  // Drinks you haven't tried here come first; tried ones only if nothing else is left.
  const fresh = pool.filter((d) => !triedHere.has(key(d.name)));
  if (fresh.length >= 3) pool = fresh;

  const best = (list, scoreOf) => list.slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const taken = new Set();
  const take = (d) => { if (d) taken.add(d.name); return d; };
  const left = () => pool.filter((d) => !taken.has(d.name));

  const unique = take(best(left(), (d) => d.uniqueness + (d.seasonal ? 0.5 : 0) + (d.popular ? 0.2 : 0)));
  const forYou = take(best(left(), (d) => hasTaste
    ? likes(d, profile) * 2 + d.uniqueness * 0.35 + (d.popular ? 1 : 0)
    : (d.popular ? 3 : 0) + d.uniqueness * 0.5 + (d.seasonal ? 0.5 : 0)));
  // Surprise: rare and not your usual. A little randomness so it changes each time.
  const outside = left().filter((d) => !hasTaste || likes(d, profile) <= 0);
  const surprise = take(best(outside.length ? outside : left(), (d) => d.uniqueness + Math.random() * 2.5));

  return [
    unique && { kind: "unique", label: "rare_find", drink: unique },
    forYou && { kind: "forYou", label: hasTaste ? "your_type" : "house_fave", drink: forYou },
    surprise && { kind: "surprise", label: "wild_card", drink: surprise },
  ].filter(Boolean);
}

// The flavor chips worth showing for this menu: the most common ones first.
export function flavorChips(drinks, max = 12) {
  const count = {};
  for (const d of drinks) for (const f of d.flavors || []) count[f] = (count[f] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, max).map(([f]) => f);
}
