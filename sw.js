// Service Worker for 粵語Chat — Cantonese Learning PWA
const CACHE_NAME = 'cantonese-chat-v1';

const PRECACHE_URLS = [
  './index.html',
  './camera.html',
  './history.html',
  './favorites.html',
  './style.css',
  './main.js',
  './modules/translator.js',
  './modules/speech.js',
  './modules/jyutping.js',
  './modules/dictionary.js',
  './dictionary_data.json',
  './jyutping_dict.json'
];

// API endpoints that should always use network (never cache)
const API_HOSTS = [
  'generativelanguage.googleapis.com',
  'api.mymemory.translated.net'
];

// Install: precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for same-origin, network-only for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for external API calls
  if (API_HOSTS.some((host) => url.hostname.includes(host))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-only for Netlify Functions
  if (url.pathname.includes('netlify/functions') || url.pathname.includes('.netlify/functions')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for same-origin requests
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            // Cache successful GET responses for future use
            if (event.request.method === 'GET' && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          });
        })
    );
    return;
  }

  // Default: network-only for other cross-origin requests
  event.respondWith(fetch(event.request));
});
