// The party after you save a drink to your journal: a little drink pops up and dances,
// confetti and fizz burst across the screen, and it says congrats. Tap anywhere (or wait) to go on.
import { CHARACTERS } from "./tour.js";

const CHEERS = ["congrats!", "cheers to that!", "look at you!", "another one!", "what a sip!"];

export function celebrate(entry, sound, done) {
  const who = Object.keys(CHARACTERS)[Math.floor(Math.random() * Object.keys(CHARACTERS).length)];
  const box = document.createElement("div");
  box.id = "celebrate";
  box.setAttribute("role", "status");
  box.innerHTML = `<canvas aria-hidden="true"></canvas>
    <div class="cheer-drink">${CHARACTERS[who]}</div>
    <h2>${CHEERS[Math.floor(Math.random() * CHEERS.length)]}</h2>
    <p>${escapeHtml(entry.drinkName)} is in your journal · ${entry.rating}/10</p>
    <p class="small">tap anywhere to keep going</p>`;
  document.body.appendChild(box);
  sound?.open?.(); // the can-opening fizz

  // confetti + fizz bubbles, drawn on a canvas
  let raf = 0;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const cv = box.querySelector("canvas"), ctx = cv.getContext("2d"), s = devicePixelRatio || 1;
    cv.width = innerWidth * s; cv.height = innerHeight * s;
    const css = getComputedStyle(document.documentElement);
    const colors = [css.getPropertyValue("--brass").trim() || "#c9a45c", css.getPropertyValue("--accent").trim() || "#b0563a", "#e8a0a0", "#b9cf86", "#f7e27a", "#8fb0c9"];
    const bits = [];
    // two party poppers from the bottom corners, plus fizz bubbles rising from the drink
    for (let i = 0; i < 160; i++) {
      const fizz = i % 5 === 0, left = i % 2 === 0;
      bits.push(fizz
        ? { x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 1.5, vy: -0.6 - Math.random() * 1.6, r: 3 + Math.random() * 5, fizz }
        : { x: left ? -10 : innerWidth + 10, y: innerHeight * (0.75 + Math.random() * 0.2),
            vx: (left ? 1 : -1) * (3 + Math.random() * 6), vy: -9 - Math.random() * 8,
            r: 4 + Math.random() * 4, spin: Math.random() * 6, vs: (Math.random() - 0.5) * 0.35, color: colors[i % colors.length] });
      if (fizz) bits[bits.length - 1].color = colors[i % colors.length];
    }
    const t0 = performance.now();
    const draw = (now) => {
      const t = (now - t0) / 1000;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy;
        if (b.fizz) { b.vx += (Math.random() - 0.5) * 0.2; b.vy -= 0.015; } else { b.vx *= 0.98; b.vy = Math.min(b.vy + 0.16, 2.6); b.spin += b.vs; b.x += Math.sin(t * 4 + b.spin) * 0.6; }
        ctx.globalAlpha = Math.min(1, Math.max(0, (4 - t) / 1.2));
        if (b.fizz) { ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.3); ctx.stroke(); }
        else { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin); ctx.fillStyle = b.color; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); ctx.restore(); }
      }
      if (t < 4) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  }

  let gone = false;
  const close = () => {
    if (gone) return; gone = true;
    clearTimeout(timer);
    box.classList.add("bye");
    setTimeout(() => { cancelAnimationFrame(raf); box.remove(); done?.(); }, 350);
  };
  const timer = setTimeout(close, 4200);
  setTimeout(() => { box.onclick = close; }, 400); // so the save tap doesn't close it right away
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
