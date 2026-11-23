// How drekka looks: paper (the classic), night (dark), matcha, berry, blue hour, or "match my
// phone" (paper by day, night when the phone is in dark mode). Saved on this device.

export const LOOKS = [
  { id: "auto", name: "match my phone", dot: "linear-gradient(90deg, #f1e6cc 50%, #241a14 50%)" },
  { id: "paper", name: "paper", dot: "#f1e6cc" },
  { id: "night", name: "night", dot: "#241a14" },
  { id: "matcha", name: "matcha", dot: "#9fb36a" },
  { id: "berry", name: "berry", dot: "#d98a9a" },
  { id: "blue", name: "blue hour", dot: "#8fb0c9" },
];

const dark = matchMedia("(prefers-color-scheme: dark)");
const saved = () => { try { return localStorage.getItem("drekka-look") || "auto"; } catch { return "auto"; } };

export function applyLook(id = saved()) {
  const html = document.documentElement;
  html.dataset.look = id;
  html.classList.toggle("dark", dark.matches);
  // the phone's top bar matches the header
  const leather = getComputedStyle(html).getPropertyValue("--leather").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", leather || "#4a3121");
}

export function setLook(id) {
  try { localStorage.setItem("drekka-look", id); } catch {}
  applyLook(id);
}
export const currentLook = saved;

// When the phone switches between light and dark, "match my phone" follows it.
dark.addEventListener?.("change", () => applyLook());
