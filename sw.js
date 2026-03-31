const CACHE_NAME = 'radon-pwa-v6';

const ASSETS = [
  './', './index.html', './css/main.css',
  './js/app.js', './js/state.js', './js/database.js',
  './js/config-ct.js', './js/config-csp.js',
  './js/plan.js', './js/terrain.js', './js/resultats.js',
  './js/export.js', './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // CDN — network first, cache fallback
  if (url.includes('cdnjs.cloudflare.com')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { if (r.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App JS/CSS — network first (toujours les dernières versions)
  if (url.includes('/js/') || url.includes('/css/')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { if (r.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Autres assets — cache first
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request))
      .catch(() => { if (e.request.mode === 'navigate') return caches.match('./index.html'); })
  );
});
