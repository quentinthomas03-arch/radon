// ============================================================
// sw.js — Service Worker : cache offline
// ============================================================

const CACHE_NAME = 'radon-pwa-v1';

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

// CDN resources (cached on first use)
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

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
  const url = new URL(event.request.url);

  // CDN resources — network first, fall back to cache
  if (CDN_URLS.some(cdn => event.request.url.startsWith(cdn.split('/').slice(0, 3).join('/')))) {
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

  // App assets — cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});
