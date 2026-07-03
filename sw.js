// sw.js — Service Worker real de Vura
// Estrategia:
//   CACHE FIRST  → assets estaticos del shell (HTML, CSS, JS, iconos, JSON
//                  del mapa vectorial). Estos no cambian entre visitas; si
//                  estan en cache, se sirven instantaneamente sin red.
//   NETWORK FIRST → Firebase Realtime Database, tiles de OpenFreeMap y
//                   cualquier otra URL de datos en vivo. Siempre intentamos
//                   la red primero; el cache es solo el ultimo recurso.
//   OFFLINE FALLBACK → si una navegacion falla completamente (sin red y sin
//                   cache), mostramos el shell de la app (index.html cacheado)
//                   para que el usuario vea algo en vez de la pantalla de
//                   error del navegador.

const CACHE_NAME = 'vura-shell-v2';

// Assets del shell: todo lo que la app necesita para pintarse aunque no haya
// red. Cuando cambia cualquiera de estos archivos hay que incrementar
// CACHE_NAME (ej. vura-shell-v2) para que el SW old se descarte y el nuevo
// precachee la version actualizada.
const SHELL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './icons.js',
    './utils.js',
    './notifications.js',
    './map.js',
    './passenger.js',
    './driver.js',
    './admin.js',
    './auth.js',
    './firebase.js',
    './seed-data.js',
    './accessibility.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './vura-map-style.json',
    './vura-driver-style.json',
];

// Dominios que siempre van directo a la red (datos en vivo).
// Cualquier URL que contenga alguno de estos patrones se excluye del cache.
const NETWORK_ONLY_PATTERNS = [
    'firebaseio.com',
    'googleapis.com',
    'openfreemap.org',
    'tiles.openfreemap.org',
    'router.project-osrm.org',
    'open-meteo.com',
    'wa.me',
];

// ============================================================
// INSTALL: precachear el shell completo
// ============================================================
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => {
                // Si algun asset falla (ej. en dev sin server), no bloqueamos
                // la instalacion; simplemente el cache queda incompleto.
                console.warn('[SW] Precache parcial:', err);
                return self.skipWaiting();
            })
    );
});

// ============================================================
// ACTIVATE: limpiar caches viejos de versiones anteriores
// ============================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => {
                        console.log('[SW] Eliminando cache viejo:', k);
                        return caches.delete(k);
                    })
            ))
            .then(() => self.clients.claim())
    );
});

// ============================================================
// FETCH: estrategia hibrida segun la URL
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = request.url;

    // Solo manejamos GET; POST/PUT de Firebase van siempre directo.
    if (request.method !== 'GET') return;

    // URLs de datos en vivo: Network Only (nunca cachear).
    if (NETWORK_ONLY_PATTERNS.some(p => url.includes(p))) {
        event.respondWith(fetch(request));
        return;
    }

    // Chrome extension requests: ignorar.
    if (url.startsWith('chrome-extension://')) return;

    // Navegaciones (documentos HTML): Network First con fallback al shell.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Assets del shell y todo lo demas: Cache First.
    event.respondWith(
        caches.match(request)
            .then(cached => {
                if (cached) return cached;
                // No esta en cache: buscamos en red y guardamos para futuras visitas.
                return fetch(request)
                    .then(response => {
                        // Solo cacheamos respuestas validas (status 200, tipo basico u opaco).
                        if (!response || response.status !== 200 ||
                            (response.type !== 'basic' && response.type !== 'opaque')) {
                            return response;
                        }
                        const toCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, toCache));
                        return response;
                    })
                    .catch(() => {
                        // Sin red y sin cache: para imagenes devolvemos nada;
                        // para todo lo demas intentamos el index cacheado.
                        if (request.destination === 'image') return new Response('', { status: 404 });
                        return caches.match('./index.html');
                    });
            })
    );
});
