/**
 * Go Fig Bookz — service worker.
 * Makes the app installable on Android/iOS (meets the PWA "installability" bar)
 * and gives a basic offline shell. Strategy:
 *  - HTML/navigations: NETWORK-FIRST (so a new deploy is picked up immediately;
 *    falls back to the cached shell only when offline).
 *  - Hashed static assets (/assets/*, js/css/fonts/images): CACHE-FIRST (safe —
 *    Vite content-hashes filenames, so cached files never go stale).
 *  - API / tRPC: never cached (always live).
 */
const CACHE = "gfb-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try { await cache.add("/"); } catch { /* offline at install — fine */ }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/trpc")) return;

  // Navigations → network-first, cached shell as offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match("/")) || (await cache.match("/index.html")) || Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed static assets → cache-first.
  if (url.pathname.startsWith("/assets/") || /\.(?:js|css|woff2?|png|jpe?g|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })(),
    );
  }
});
