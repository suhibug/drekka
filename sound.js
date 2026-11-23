// drekka's music and touch feedback. Everything is made by code (Web Audio), never recordings,
// so there's nothing copyrighted.
//
// The music: calm, original pieces in the spirit of soft game soundtracks (warm analog-style
// pads, a slow rising arpeggio, glockenspiel and soft piano notes, lots of space). Each piece has
// its own key, chords, speed and instruments; a new one starts every couple of minutes, and the
// notes are chosen fresh each time, so it never repeats exactly.
//
// Taps: a tiny vibration instead of a sound.
// The speaker button turns the music off (remembered). The music stops completely when you leave
// the app, so it never shows up as "playing" on the lock screen.

// ---------- The pieces (a little library of moods) ----------
// Chords are written as note numbers (60 = middle C). Original progressions, nothing copied.
const PIECES = [
  { name: "morning moss", bpm: 66, chords: [[52, 59, 62, 66, 71], [48, 55, 59, 64, 67], [43, 50, 55, 59, 64], [50, 57, 61, 64, 66]], arp: true, bells: true },
  { name: "slow river", bpm: 58, chords: [[53, 60, 64, 67, 69], [52, 59, 62, 67, 71], [50, 57, 60, 65, 69], [48, 55, 59, 64, 67]], piano: true },
  { name: "window light", bpm: 72, chords: [[57, 64, 68, 71, 73], [54, 61, 64, 68, 73], [50, 57, 61, 66, 69], [52, 59, 64, 68, 73]], arp: true, piano: true },
  { name: "fern hollow", bpm: 62, chords: [[50, 57, 61, 64, 69], [47, 54, 57, 62, 66], [43, 50, 54, 59, 62], [45, 52, 57, 59, 64]], bells: true, piano: true },
  { name: "rain on leaves", bpm: 54, chords: [[48, 55, 59, 64, 67], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 62]], arp: true },
  { name: "lantern", bpm: 68, chords: [[51, 58, 62, 65, 70], [48, 55, 58, 63, 67], [44, 51, 55, 60, 63], [46, 53, 58, 60, 65]], bells: true },
  { name: "blue hour", bpm: 60, chords: [[52, 59, 63, 66, 71], [49, 56, 59, 64, 68], [45, 52, 56, 61, 64], [47, 54, 59, 61, 66]], arp: true, piano: true },
  { name: "garden path", bpm: 64, chords: [[55, 62, 66, 69, 74], [52, 59, 62, 67, 71], [48, 55, 59, 64, 67], [50, 57, 62, 64, 69]], piano: true, bells: true },
];
const PIECE_SECONDS = 120;

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
const any = (list) => list[Math.floor(Math.random() * list.length)];

let ctx, master, wet, timer, piece, pieceStart, step = 0, nextTime = 0;
let muted = (() => { try { return localStorage.getItem("drekka-muted") === "1"; } catch { return false; } })();
export const isMuted = () => muted;
// Music volume, 0 to 1 (settings has a slider). Kept low on purpose: it should sit quietly in the background.
let volume = (() => { try { const v = parseFloat(localStorage.getItem("drekka-volume")); return isNaN(v) ? 0.5 : v; } catch { return 0.5; } })();
export const getVolume = () => volume;
const level = () => (muted ? 0 : 0.45 * volume * volume); // a gentle curve: the slider feels even

// ---------- Audio setup ----------
function start() {
  if (ctx) return;
  // "ambient": plays alongside your own music, follows the silent switch, and never shows a
  // player on the lock screen.
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch {}
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.ratio.value = 3;
  master = ctx.createGain(); master.gain.value = level();
  master.connect(comp); comp.connect(ctx.destination);
  // A soft, roomy reverb made from fading noise: it's what makes it feel calm and far away.
  const verb = ctx.createConvolver(), len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  verb.buffer = ir;
  wet = ctx.createGain(); wet.gain.value = 0.55;
  wet.connect(verb); verb.connect(master);
}

// One voice. kind: "pad" (warm, slow swell), "arp" (soft synth pluck), "bell" (glockenspiel), "piano".
function voice(note, when, len, kind, vol) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when, g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const oscs = [];
  const osc = (type, freq, gain = 1) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = freq; og.gain.value = gain; o.connect(og); og.connect(lp); oscs.push(o); return o; };
  const f = hz(note);
  if (kind === "pad") { // two slightly detuned saws through a dark filter: the "analog" warmth
    osc("sawtooth", f * 0.997, 0.5); osc("sawtooth", f * 1.003, 0.5);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(900 + Math.random() * 500, t + len / 2); lp.frequency.linearRampToValueAtTime(500, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + len * 0.4); g.gain.linearRampToValueAtTime(0, t + len);
  } else if (kind === "arp") {
    osc("triangle", f); osc("sine", f * 2, 0.15);
    lp.frequency.value = 1800;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  } else if (kind === "bell") { // glockenspiel: a pure tone plus a bright, quick overtone
    osc("sine", f); osc("sine", f * 2.76, 0.25); osc("sine", f * 5.4, 0.08);
    lp.frequency.value = 6000;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  } else { // soft piano-ish
    osc("triangle", f); osc("sine", f * 2, 0.3); osc("sine", f * 3, 0.08);
    lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }
  lp.connect(g); g.connect(master); g.connect(wet);
  for (const o of oscs) { o.start(t); o.stop(t + len + 0.1); }
}

// ---------- The music player ----------
function newPiece() {
  const choices = PIECES.filter((p) => p !== piece);
  piece = any(choices); pieceStart = ctx.currentTime; step = 0;
}

// Plans the next few seconds of music, a beat at a time.
function schedule() {
  if (!ctx || muted) return;
  if (!piece || ctx.currentTime - pieceStart > PIECE_SECONDS) newPiece();
  const beat = 60 / piece.bpm;
  while (nextTime < ctx.currentTime + 1.5) {
    const when = nextTime - ctx.currentTime;
    const bar = Math.floor(step / 8), inBar = step % 8;
    const chord = piece.chords[bar % piece.chords.length];
    // A pad swells on every new chord (lowest notes only, kept quiet).
    if (inBar === 0) for (const n of chord.slice(0, 3)) voice(n, when, beat * 8.4, "pad", 0.035);
    // The slow rising arpeggio, now and then resting.
    if (piece.arp && inBar % 2 === 0 && Math.random() < 0.85) {
      const up = chord.slice(1).concat(chord.slice(1, 3).map((n) => n + 12));
      voice(up[(inBar / 2 + bar) % up.length] + 12, when, beat * 2.5, "arp", 0.05);
    }
    // A gentle melody on bells or piano: sparse, notes from the chord, lots of space.
    if ((piece.bells || piece.piano) && Math.random() < (inBar === 0 ? 0.6 : 0.18)) {
      const kind = piece.bells && piece.piano ? any(["bell", "piano"]) : piece.bells ? "bell" : "piano";
      voice(any(chord.slice(2)) + (kind === "bell" ? 24 : 12), when, kind === "bell" ? 2.2 : 3, kind, kind === "bell" ? 0.05 : 0.07);
    }
    nextTime += beat; step++;
  }
}

function play() {
  if (!ctx || muted || timer) return;
  nextTime = ctx.currentTime + 0.3;
  schedule();
  timer = setInterval(schedule, 400);
}
function stop() { clearInterval(timer); timer = null; }

// Leaving the app (home screen, lock, other app): stop everything and let go of the audio,
// so nothing keeps "playing" in the background.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && ctx) { stop(); ctx.close(); ctx = null; piece = null; }
});

// ---------- Touch feedback: a tiny vibration ----------
// Android: the vibration api. iphone (ios 18+): tapping a hidden switch gives a soft haptic tick.
let hapticSwitch;
function buzz() {
  if (navigator.vibrate) { navigator.vibrate(8); return; }
  if (!hapticSwitch) {
    hapticSwitch = document.createElement("label");
    hapticSwitch.setAttribute("aria-hidden", "true");
    hapticSwitch.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    const box = document.createElement("input");
    box.type = "checkbox"; box.setAttribute("switch", ""); box.tabIndex = -1;
    hapticSwitch.appendChild(box);
    document.body.appendChild(hapticSwitch);
  }
  hapticSwitch.click();
}

// A few soft notes that fit whatever piece is playing.
function chime(steps, gap, kind) {
  if (!ctx || muted) return;
  const chord = (piece || PIECES[0]).chords[0];
  steps.forEach((s, i) => voice(chord[s % chord.length] + 24, i * gap, 2.2, kind, 0.06));
}


// The welcome sound: a can opening ("pssht"), then fizzy bubbles popping. Made by code too.
function canOpen() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, out = ctx.createGain();
  out.gain.value = 0.9 * volume + 0.15; // a touch louder than the music, still soft
  out.connect(ctx.destination);
  // the tab click
  const click = ctx.createOscillator(), cg = ctx.createGain();
  click.type = "triangle"; click.frequency.setValueAtTime(1800, t); click.frequency.exponentialRampToValueAtTime(300, t + 0.03);
  cg.gain.setValueAtTime(0.25, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  click.connect(cg); cg.connect(out); click.start(t); click.stop(t + 0.06);
  // the gas rushing out: noise that starts bright and fades
  const len = 0.6, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const hiss = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), hg = ctx.createGain();
  hiss.buffer = buf; hp.type = "bandpass"; hp.Q.value = 0.8;
  hp.frequency.setValueAtTime(6000, t + 0.02); hp.frequency.exponentialRampToValueAtTime(2500, t + len);
  hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.22, t + 0.04); hg.gain.exponentialRampToValueAtTime(0.001, t + len);
  hiss.connect(hp); hp.connect(hg); hg.connect(out); hiss.start(t + 0.02);
  // bubbles: tiny rising "plips", many at first, then fewer
  for (let i = 0; i < 38; i++) {
    const at = t + 0.25 + Math.pow(Math.random(), 1.7) * 2.2;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = 900 + Math.random() * 2200;
    o.type = "sine"; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 1.9, at + 0.025);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.03, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
    o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.05);
  }
}

// Turning a page: one quick, soft paper fold (a short brush of noise that dulls as it folds).
function fold() {
  if (!ctx || muted) return;
  const t = ctx.currentTime, len = 0.12;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
  const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf; bp.type = "bandpass"; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(900, t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
}

export const sound = {
  open() { canOpen(); buzz(); },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("drekka-volume", String(volume)); } catch {}
    if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.1);
  },
  // Call on every tap: wakes audio up (phones need a tap first) and starts the music.
  wake() {
    start();
    if (ctx.state !== "running") ctx.resume();
    play();
  },
  tap() { buzz(); },
  chip() { buzz(); },
  reveal() { chime([1, 2, 3], 0.16, "bell"); },
  page() { fold(); },
  save() { buzz(); fold(); chime([2, 3, 4], 0.12, "bell"); },
  toggle() {
    muted = !muted;
    try { localStorage.setItem("drekka-muted", muted ? "1" : "0"); } catch {}
    if (muted) { stop(); if (master) master.gain.value = 0; }
    else { start(); master.gain.value = level(); ctx.resume(); play(); }
    return muted;
  },
};
