// Keeps the app's own files on the device so it opens fast and works offline.
// Menus and AI answers are never cached here (the app saves those itself, per day).
const CACHE = "drekka-v13";
const FILES = ["./", "index.html", "style.css", "app.js", "config.js", "ai.js", "menu.js", "quiz.js", "picks.js", "sound.js", "manifest.json", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // AI, place search and fonts go straight to the network
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request)));
});
