// Tiny fizz bubbles along the edges of the screen that move with you, like motion cues in a car:
// when the phone speeds up, slows down or turns, the dots slide the other way, so reading on the
// move feels calmer. Phones without a motion sensor (or that say no) get dots that drift gently.
// Used on the welcome pages and while a menu is being read.

let canvas, raf, dots = [], push = { x: 0, y: 0 }, listening = false;

// iphones ask before sharing motion: this must run inside a tap. Others just work.
export function askForMotion() {
  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission().then((ok) => { if (ok === "granted") listen(); }).catch(() => {});
    } else listen();
  } catch { /* no sensor: dots just drift */ }
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("devicemotion", (e) => {
    const a = e.acceleration;
    if (!a || a.x == null) return;
    // smooth it, so a bump doesn't make the dots jump
    push.x = push.x * 0.85 + (a.x || 0) * 0.15;
    push.y = push.y * 0.85 + (a.y || 0) * 0.15;
  });
}

export function startDots() {
  if (canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  canvas = document.createElement("canvas");
  canvas.className = "motion-dots";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const size = () => { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; };
  size(); addEventListener("resize", size);
  // Two columns of dots, one on each edge.
  dots = [];
  for (let i = 0; i < 9; i++) for (const side of [0, 1]) {
    dots.push({ side, y: (i + 0.5) / 9, r: 1.6 + Math.random() * 1.8, phase: Math.random() * 6.28, ox: 0, oy: 0, rise: 4 + Math.random() * 6 });
  }
  // the faded ink of whatever look is on, see-through
  const faded = getComputedStyle(document.documentElement).getPropertyValue("--faded").trim() || "#8a7258";
  const bubbleColor = faded;
  const t0 = performance.now();
  const draw = (now) => {
    const t = (now - t0) / 1000, w = canvas.width, h = canvas.height, s = devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    // tiny fizz bubbles: just a thin, faint ring in the look's own ink color (so they suit paper and night alike)
    ctx.strokeStyle = bubbleColor;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1 * s;
    for (const d of dots) {
      // move against the push (with a little spring back), plus a slow gentle drift
      d.ox += (-push.x * 9 - d.ox) * 0.08;
      d.oy += (push.y * 9 - d.oy) * 0.08;
      const x = (d.side ? w - 7 * s : 7 * s) + (d.ox + Math.sin(t * 0.7 + d.phase) * 3) * s;
      // each bubble slowly floats up and wraps around, like fizz
      const y = (((d.y * h - t * d.rise * s + d.oy * s) % h) + h) % h;
      ctx.beginPath(); ctx.arc(x, y, d.r * s, 0, 6.283); ctx.stroke();
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
}

export function stopDots() {
  cancelAnimationFrame(raf);
  canvas?.remove();
  canvas = null;
}
