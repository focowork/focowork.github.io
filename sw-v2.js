/* ===============================
   FOCOWORK – Service Worker FINAL
   =============================== */

const CACHE_NAME = "focowork-v3.1";

/* Archivos esenciales de la app */
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

/* ===============================
   INSTALL – precache obligatorio
   =============================== */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
});

/* ===============================
   ACTIVATE – limpiar caches viejos
   =============================== */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ===============================
   FETCH – cache first, network fallback
   =============================== */
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          // Guardar en cache lo que venga de red
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Fallback mínimo si todo falla
          if (event.request.destination === "document") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
