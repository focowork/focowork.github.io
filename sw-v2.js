self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  self.clients.claim();
});

/* 👇 ESTO ES LO QUE FALTABA */
self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request));
});
