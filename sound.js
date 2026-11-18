// Soft sounds made with code (Web Audio), never recordings. Gentle but clearly audible.
// A calm background melody starts on the first tap and changes every time.
// The speaker button turns everything off, and the app remembers that choice.

const SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0]; // C major pentatonic
let ctx, master, echo, bgTimer;
let muted = (() => { try { return localStorage.getItem("drekka-muted") === "1"; } catch { return false; } })();

export const isMuted = () => muted;

function start() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  // A soft echo makes single notes feel warm instead of beepy.
  echo = ctx.createDelay(); echo.delayTime.value = 0.32;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  echo.connect(fb); fb.connect(echo); echo.connect(master);
}

// One soft bell-like note. when = seconds from now.
function note(freq, when = 0, length = 1.4, volume = 0.22, type = "sine") {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq;
  lp.type = "lowpass"; lp.frequency.value = 2400;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(lp); lp.connect(g); g.connect(master); g.connect(echo);
  o.start(t); o.stop(t + length + 0.05);
}

const any = (list) => list[Math.floor(Math.random() * list.length)];

// A page turning: a short soft hiss.
function rustle(when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when, len = 0.35;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / d.length);
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 3000; bp.Q.value = 0.7; g.gain.value = 0.35;
  src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
}

export const sound = {
  // Call on every tap: wakes audio up (browsers need a tap first) and starts the background melody.
  wake() { start(); if (ctx.state === "suspended") ctx.resume(); if (!bgTimer && !muted) background(); },
  tap() { note(any(SCALE.slice(3)), 0, 0.5, 0.14, "triangle"); },
  chip(on) { note(on ? SCALE[6] : SCALE[3], 0, 0.45, 0.13, "triangle"); },
  // Three picks appear: a rising little arpeggio, different every time.
  reveal() { const base = Math.floor(Math.random() * 3); [0, 2, 4].forEach((s, i) => note(SCALE[base + s], i * 0.14, 1.6, 0.2)); },
  page() { rustle(); },
  save() { rustle(); [4, 6, 8].forEach((s, i) => note(SCALE[s], 0.1 + i * 0.1, 1.8, 0.18)); },
  toggle() {
    muted = !muted;
    try { localStorage.setItem("drekka-muted", muted ? "1" : "0"); } catch {}
    if (master) master.gain.value = muted ? 0 : 0.8;
    if (muted) { clearTimeout(bgTimer); bgTimer = null; } else { start(); background(); }
    return muted;
  },
};

// Background: a slow, wandering melody with a soft low note now and then. Never repeats exactly.
function background() {
  clearTimeout(bgTimer);
  const step = () => {
    if (muted) { bgTimer = null; return; }
    note(any(SCALE) * (Math.random() < 0.3 ? 0.5 : 1), 0, 3.2, 0.08);
    if (Math.random() < 0.25) note(any(SCALE.slice(0, 4)) / 2, 0.2, 4.5, 0.07);
    bgTimer = setTimeout(step, 1600 + Math.random() * 2600);
  };
  step();
}
