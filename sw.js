// Service worker minimo, requerido para que Chrome considere la app instalable.
// No cachea nada todavia: cada carga sigue pidiendo datos frescos a Firebase.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Passthrough: no se cachea nada por ahora, todo va directo a la red.
  event.respondWith(fetch(event.request));
});
