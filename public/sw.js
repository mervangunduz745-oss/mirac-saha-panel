const CACHE_NAME = "mirac-erp-shell-v40";
const APP_SHELL = [
  "/",
  "/index.html",
  "/mobil.html",
  "/catalog-inventory.js",
  "/firebase-cloud.js",
  "/firebase-config.js",
  "/manifest.webmanifest",
  "/favicon.svg"
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
  const isAppAsset = url.origin === self.location.origin;
  if (!isAppAsset) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          const cacheKey = url.pathname === "/mobil" || url.pathname === "/mobil.html"
            ? "/mobil.html"
            : "/index.html";
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy));
          return response;
        })
        .catch(() => {
          if (url.pathname === "/mobil" || url.pathname === "/mobil.html") {
            return caches.match("/mobil.html");
          }
          return caches.match("/index.html");
        })
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
