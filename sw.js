// ============================================================
// sw.js — Service Worker : cache offline
// ============================================================

const CACHE_NAME = 'radon-pwa-v10';

const ASSETS = [
  './',
  './index.html',
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
  './manifest.json',
];

// CDN (unpkg, fallback jsdelivr — jamais cdnjs, bloqué par l'anti-tracking sur le terrain)
const CDN_ORIGINS = ['https://unpkg.com', 'https://cdn.jsdelivr.net'];

// Install — cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for app, network-first for CDN
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

  // JS/CSS — network first (toujours les dernières versions)
  if (url.includes('/js/') || url.includes('/css/')) {
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

  // Autres assets — cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
      .catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      })
  );
});
