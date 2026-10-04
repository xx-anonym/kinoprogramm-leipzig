'use strict';

// Netz zuerst, Cache nur als Rückfall: Online gibt es immer das aktuelle Programm,
// offline (z. B. im Kinosaal ohne Empfang) das zuletzt geladene.
const CACHE = 'kinoprogramm-leipzig';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || Response.error())),
  );
});
