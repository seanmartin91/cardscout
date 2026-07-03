// CardScout service worker — keeps the app installable while avoiding stale versions.
const CACHE = 'cardscout-v3';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (_) { return; }
  // App shell: always network-first so users get the latest build; fall back to cache offline.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put('/', c)); return r; })
                .catch(() => caches.match('/'))
    );
    return;
  }
  // Icons/manifest: cache-first.
  if (/\.(png|ico|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => { const cl = r.clone(); caches.open(CACHE).then(ca => ca.put(req, cl)); return r; })));
  }
});
