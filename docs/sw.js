// Maç Rehberi service worker: uygulama dosyalarını önbelleğe alır,
// data.json için önce ağı dener (çevrimdışıyken son bilinen veriyi gösterir).
const CACHE = "mac-rehberi-v1";
const ASSETS = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Veri ve sayfa: önce ağ, olmazsa önbellek
  if (url.pathname.endsWith("data.json") || e.request.mode === "navigate" || /\.(js|css)$/.test(url.pathname)) {
    const key = url.pathname.endsWith("data.json") ? "data.json" : e.request;
    e.respondWith(
      fetch(e.request).then((r) => {
        if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(key, cp)); }
        return r;
      }).catch(() => caches.match(key).then((r) => r || caches.match("index.html")))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
