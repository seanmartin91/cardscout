// CardScout service worker - DISABLED (kill-switch).
// The caching SW made users get stale builds. This version deletes all caches,
// unregisters itself, and reloads open tabs so everyone lands on the latest build
// and then runs with no service worker at all (always fresh from the network).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try { var keys = await caches.keys(); await Promise.all(keys.map(function (k) { return caches.delete(k); })); } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try { var cs = await self.clients.matchAll({ type: 'window' }); cs.forEach(function (c) { c.navigate(c.url); }); } catch (e) {}
  })());
});
// No fetch handler - all requests go straight to the network.
