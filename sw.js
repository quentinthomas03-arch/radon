// ============================================================
// sw.js — Service Worker : cache offline (network-first pour js/css)
// ============================================================

const CACHE_NAME = 'radon-pwa-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './favicon-96x96.png',
  './apple-touch-icon.png',
  './web-app-manifest-192x192.png',
  './web-app-manifest-512x512.png',
  './web-app-manifest-maskable-512x512.png',
  './css/main.css',
  './js/app.js',
  './js/state.js',
  './js/database.js',
  './js/config-ct.js',
  './js/config-csp.js',
  './js/plan.js',
  './js/terrain.js',
  './js/resultats.js',
  './js/export.js',
];

// CDN (unpkg, fallback jsdelivr — jamais cdnjs, bloqué par l'anti-tracking sur le terrain)
const CDN_ORIGINS = ['https://unpkg.com', 'https://cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] Fichier ignoré:', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // CDN (SheetJS, pdf.js) — network first, fallback cache
  if (CDN_ORIGINS.some(origin => url.startsWith(origin))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets applicatifs (js/css) — network first pour toujours servir la dernière
  // version déployée ; repli sur le cache hors-ligne.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      }))
  );
});
