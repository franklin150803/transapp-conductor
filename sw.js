// Service Worker de Vura — estrategia stale-while-revalidate para shell
// de la app (HTML, CSS, JS propios) y cache-first para assets estáticos.
// Esto permite:
//   1. Primera carga: siempre desde red, se guarda en cache.
//   2. Recargas siguientes: se sirve desde cache mientras se actualiza en
//      segundo plano — la app abre instantáneamente aunque haya red lenta.
//   3. Sin internet: se sirve lo que hay en cache; si tampoco está en
//      cache, se muestra un fallback offline en vez de pantalla blanca.

const CACHE_NAME = 'vura-shell-v2';

// Archivos propios que queremos tener siempre disponibles offline.
// Solo se precachean los que existen en la raíz del repo; las librerías
// de CDN se cachean dinámicamente la primera vez que se piden.
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './map.js',
    './passenger.js',
    './driver.js',
    './admin.js',
    './auth.js',
    './firebase.js',
    './notifications.js',
    './accessibility.js',
    './utils.js',
    './icons.js',
    './seed-data.js',
    './manifest.json',
    './vura-map-style.json',
    './vura-driver-style.json',
    './icon-192.png',
    './icon-512.png'
];

// Dominios externos que queremos cachear dinámicamente.
const CACHE_CDN_ORIGINS = [
    'unpkg.com',
    'cdn.jsdelivr.net',
    'tiles.openfreemap.org',
    'fonts.gstatic.com'
];

// ── Install: precachear shell de la app ──────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // addAll falla si cualquier URL da error; usamos add() uno a uno
            // para no bloquear la instalación si algún asset no existe.
            return Promise.allSettled(
                PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))
            );
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: limpiar caches antiguos ────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: stale-while-revalidate para shell, passthrough para Firebase ──
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Firebase Realtime Database y Auth siempre van a red — cachearlos
    // rompería la sincronización en tiempo real que es el corazón de Vura.
    if (url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebase.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('api.openrouteservice.org')) {
        return; // passthrough, el navegador maneja la petición normalmente
    }

    // Solo interceptamos GET
    if (request.method !== 'GET') return;

    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(request).then(cached => {
                // Siempre intentamos actualizar en segundo plano
                const fetchPromise = fetch(request)
                    .then(response => {
                        // Solo cacheamos respuestas válidas de orígenes conocidos
                        if (response && response.status === 200 &&
                            (url.origin === self.location.origin ||
                             CACHE_CDN_ORIGINS.some(o => url.hostname.includes(o)))) {
                            cache.put(request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => null);

                // Si tenemos cache: lo devolvemos de inmediato (stale)
                // y actualizamos en background.
                // Si no hay cache: esperamos la red; si falla, fallback offline.
                return cached || fetchPromise.then(res => res || offlineFallback());
            })
        )
    );
});

function offlineFallback() {
    return new Response(
        `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vura — Sin conexión</title>
<style>
  body{margin:0;background:#0a0e16;color:#eef2f7;font-family:sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       min-height:100vh;text-align:center;padding:24px}
  .icon{font-size:4rem;margin-bottom:16px}
  h1{font-size:1.4rem;margin:0 0 8px}
  p{font-size:0.9rem;color:#9aa7bd;max-width:280px}
  button{margin-top:24px;padding:12px 24px;background:#0d9488;color:white;
         border:none;border-radius:12px;font-size:0.9rem;cursor:pointer}
</style>
</head>
<body>
  <div class="icon">🚌</div>
  <h1>Sin conexión</h1>
  <p>Vura necesita internet para mostrar los buses en tiempo real. Conéctate y vuelve a intentarlo.</p>
  <button onclick="location.reload()">Reintentar</button>
</body>
</html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}
