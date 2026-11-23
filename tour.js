// A little tour of the buttons, right after the welcome (and from settings → "show me around").
// The rest of the screen dims, the button pops and zooms in, and a different little drink
// character explains it in a speech bubble.

// The characters: tiny drinks with faces. Each one is a few simple shapes.
const FACE = (x, y) => `<g class="face"><circle cx="${x - 7}" cy="${y}" r="2.2"/><circle cx="${x + 7}" cy="${y}" r="2.2"/>
  <path d="M${x - 4} ${y + 5}q4 4 8 0" fill="none"/><circle class="blush" cx="${x - 12}" cy="${y + 4}" r="2.6"/><circle class="blush" cx="${x + 12}" cy="${y + 4}" r="2.6"/></g>`;
export const CHARACTERS = {
  coffee: `<svg viewBox="0 0 80 80"><path class="steam" d="M32 14q-4 -5 0 -10M42 14q-4 -5 0 -10"/>
    <path d="M18 24h40l-4 38a7 7 0 0 1-7 6H29a7 7 0 0 1-7-6z" fill="#f6ecd8"/><path d="M58 32h4a7 7 0 0 1 0 14h-5" fill="none"/>
    <rect x="16" y="20" width="44" height="6" rx="3" fill="#8a5a3b"/>${FACE(38, 44)}</svg>`,
  boba: `<svg viewBox="0 0 80 80"><path d="M46 4l-6 22" fill="none"/><path d="M20 24q20 -14 40 0z" fill="#fbe9ef"/>
    <path d="M20 24h40l-5 42a6 6 0 0 1-6 5H31a6 6 0 0 1-6-5z" fill="#e9c9a8"/>
    <circle class="pearl" cx="32" cy="62" r="3"/><circle class="pearl" cx="40" cy="64" r="3"/><circle class="pearl" cx="48" cy="61" r="3"/>${FACE(40, 40)}</svg>`,
  lemonade: `<svg viewBox="0 0 80 80"><circle cx="56" cy="18" r="10" fill="#f7e27a"/><path d="M56 8v20M46 18h20M49 11l14 14M63 11l-14 14" stroke-width="1"/>
    <path d="M20 22h40l-5 46a5 5 0 0 1-5 4H30a5 5 0 0 1-5-4z" fill="#fff6c4"/>${FACE(40, 44)}</svg>`,
  matcha: `<svg viewBox="0 0 80 80"><path d="M16 30h48v14a24 24 0 0 1-48 0z" fill="#b9cf86"/>
    <path d="M22 30q6 -6 12 0t12 0t12 0" fill="none" stroke-width="1.2"/>${FACE(40, 46)}</svg>`,
};

// The stops on the tour. target: what to point at. say: what the little drink says.
const STOPS = [
  { target: "#journal-btn", who: "coffee", say: "this is your <b>journal</b>! every drink you save lands here with its photo and your rating. it's your drink scrapbook." },
  { target: "#sound-btn", who: "boba", say: "this is the <b>music</b>. calm little tunes while you choose. tap it once if you'd like quiet." },
  { target: "#settings-btn", who: "lemonade", say: "this is <b>settings</b>. switch to night mode or a cute color, change the volume, or retake your taste quiz." },
  { target: "#near-btn", who: "matcha", say: "out with no plan? tap <b>find a spot near me</b>, say what you're craving, and see the places people nearby love most." },
];

const $ = (id) => document.getElementById(id);

export function runTour(sound, done) {
  const box = $("tour");
  let i = 0;
  box.hidden = false;
  const finish = () => { box.hidden = true; box.innerHTML = ""; removeEventListener("resize", draw); done(); };

  function draw() {
    const stop = STOPS[i];
    const el = document.querySelector(stop.target);
    if (!el || el.offsetParent === null) { i++; return i < STOPS.length ? draw() : finish(); }
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.bottom > innerHeight * 0.7) el.scrollIntoView({ block: "center", behavior: "instant" }); // only when it's hard to see
    const r = el.getBoundingClientRect(), pad = 8;
    const below = r.top < innerHeight * 0.55; // bubble under the button, or above it near the bottom
    box.innerHTML = `
      <div class="tour-ring ${r.width > 120 ? "wide" : ""}" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px">
        <div class="tour-zoom">${el.innerHTML}</div>
      </div>
      <div class="tour-bubble ${below ? "below" : "above"}" style="${below ? `top:${r.bottom + 22}px` : `bottom:${innerHeight - r.top + 22}px`}">
        <div class="tour-who">${CHARACTERS[stop.who]}</div>
        <div class="tour-talk">
          <p>${stop.say}</p>
          <div class="tour-nav">
            <span class="small">${i + 1} of ${STOPS.length}</span>
            <button class="link-btn" id="tour-skip">${i < STOPS.length - 1 ? "skip" : ""}</button>
            <button class="ink-btn" id="tour-next">${i < STOPS.length - 1 ? "next" : "got it!"}</button>
          </div>
        </div>
      </div>`;
    // the bubble's little tail points at the button
    const bubble = box.querySelector(".tour-bubble");
    bubble.style.setProperty("--tail", `${Math.min(Math.max(r.left + r.width / 2 - bubble.getBoundingClientRect().left, 24), bubble.offsetWidth - 24)}px`);
    $("tour-next").onclick = () => { sound.page(); i++; i < STOPS.length ? draw() : finish(); };
    $("tour-skip").onclick = () => { sound.tap(); finish(); };
  }
  addEventListener("resize", draw);
  sound.reveal();
  draw();
}
