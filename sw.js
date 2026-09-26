/* يخزّن واجهة المنصة لتفتح بسرعة، ولا يخزّن أي بيانات أو ملفات خاصة. */
const CACHE = "coop-shell-v1";
const SHELL = ["assets/app.css?v=1.0.0", "assets/app.js?v=1.0.0", "assets/icon.svg", "assets/icon-192.png", "manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.endsWith("api.php") || u.pathname.endsWith("eval.php") || u.pathname.endsWith("install.php")) return;
  if (u.pathname.includes("/assets/") || u.pathname.endsWith(".webmanifest")) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
  }
});
