const CACHE_NAME = "mirac-erp-shell-v42-pages";
const BASE = "/mirac-saha-panel/";
const APP_SHELL = [
  BASE,
  `${BASE}index.html`,
  `${BASE}mobil.html`,
  `${BASE}catalog-inventory.js`,
  `${BASE}firebase-cloud.js`,
  `${BASE}firebase-config.js`,
  `${BASE}manifest.webmanifest`,
  `${BASE}favicon.svg`
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const mobilePath = url.pathname === `${BASE}mobil` || url.pathname === `${BASE}mobil.html`;
    const cacheKey = mobilePath ? `${BASE}mobil.html` : `${BASE}index.html`;
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
          return response;
        })
        .catch(() => caches.match(cacheKey))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok || response.type === "opaque") {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
