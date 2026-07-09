// AshaGuard GPS PWA Service Worker
const CACHE_NAME = "ashaguard-gps-v1";
const ASSETS = [
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/lucide@latest"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching shell assets...");
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Removing cached assets from: ", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event (Network-First Fallback-to-Cache Strategy)
self.addEventListener("fetch", (e) => {
  // Only handle HTTP/S requests (ignores chrome-extension / native protocols)
  if (!e.request.url.startsWith(self.location.origin) && !e.request.url.startsWith("https://")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Clone response to put into cache
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => {
        // Fallback to cache on network failure
        return caches.match(e.request);
      })
  );
});
