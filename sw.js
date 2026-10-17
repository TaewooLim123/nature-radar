/* Service worker: lets Nature Radar open and work with no connection.
   • App files: network first (so updates you push show up right away), saved copy when offline.
   • AI model + TensorFlow.js: saved the first time they download, then served from the device.
   • Map tiles you've looked at: saved (up to 600), so the map still shows offline.
   The iNaturalist API and Supabase aren't handled here; the app has its own offline fallbacks. */
const VERSION = 'v14'; // bump to clear old saved app files
const SHELL = `nr-shell-${VERSION}`;
const AI = 'nr-ai-v2'; // v2: the MobileNet weights are one file now (were 55 shards)
const TILES = 'nr-tiles-v1';
const PHOTOS = 'nr-photos-v1';

const SHELL_FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './app.js', './shared.js', './store.js', './sightings.js', './community.js', './community-seed.js',
  './account.js', './ai.js', './ai-labels.js', './species-labels.js', './share-card.js', './collection.js', './config.js', './demo-data.js',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One at a time, so a single missing file can't stop the rest from being saved.
    await Promise.all(SHELL_FILES.map(f => cache.add(f).catch(err => console.warn('Not cached:', f, err))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, AI, TILES, PHOTOS]);
    for (const key of await caches.keys()) {
      if (key.startsWith('nr-') && !key.startsWith('nr-last-good') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.includes('/models/') || url.pathname.includes('/vendor/tfjs/') || url.pathname.includes('/vendor/tflite/')) {
      event.respondWith(cacheFirst(req, AI));
    } else {
      event.respondWith(networkFirst(req, SHELL));
    }
  } else if (url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(req, TILES, 600));
  } else if (url.hostname === 'inaturalist-open-data.s3.amazonaws.com' || url.hostname === 'static.inaturalist.org') {
    event.respondWith(cacheFirst(req, PHOTOS, 300));
  }
});

// Try the network for up to 4 s; fall back to the saved copy (or wait longer if there isn't one).
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  // no-cache: always check with the server, so a freshly pushed update isn't hidden by the browser's cache.
  const fresh = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' });
  const network = fresh.then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  try {
    const res = await Promise.race([network, new Promise(resolve => setTimeout(resolve, 4000))]);
    if (res) return res;
  } catch { /* offline */ }
  const saved = await cache.match(req, { ignoreSearch: true })
    || (req.mode === 'navigate' ? await cache.match('./index.html') || await cache.match('./') : null);
  return saved || network;
}

async function cacheFirst(req, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  // Opaque (no-CORS) responses can't be checked and use lots of storage, so they're not saved.
  if (res.ok && res.type !== 'opaque') {
    await cache.put(req, res.clone());
    if (limit) trim(cache, limit);
  }
  return res;
}

async function trim(cache, limit) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}
