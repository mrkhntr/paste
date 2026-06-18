// Safe Paste service worker — offline support.
// Strategy (from NoPaste): precache local files + third-party libraries,
// then serve cache-first, falling back to the network and caching the result.
const VERSION = '2026-06-17-5';
const CACHE = 'safepaste-' + VERSION;

// Relative paths resolve against this worker's location, so they work when the
// app is hosted under a subpath like /paste/.
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.json',
  './opensearch.xml',
  'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js',
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/highlight.min.js',
  'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css',
  'https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js',
  'https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (!url.startsWith(self.location.origin) && !url.startsWith('https://cdn.jsdelivr.net')) {
    return; // let the network handle anything we don't manage
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
