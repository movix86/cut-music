/* ============================================================
   CUT MUSIC 1.0 — Service Worker
   Cachea el shell de la app y los recursos de la interfaz.
   El núcleo de FFmpeg (30 MB) se cachea la primera vez que se usa.
   ============================================================ */
const VERSION = 'cutmusic-v1.1.0-langpicker';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/validation.js',
  './js/file-manager.js',
  './js/worker-manager.js',
  './js/splitter-engine.js',
  './js/wave-editor.js',
  './js/i18n.js',
  './js/export-manager.js',
  './workers/audio-worker.js',
  './vendor/bootstrap/bootstrap.min.css',
  './vendor/bootstrap/bootstrap.bundle.min.js',
  './vendor/bootstrap-icons/bootstrap-icons.min.css',
  './vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './vendor/jszip/jszip.min.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Núcleo de FFmpeg: cache-first (son 30 MB y no cambian).
  if (url.pathname.includes('/vendor/ffmpeg/')) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  // Código de la app: red primero para no servir versiones antiguas.
  const ext = url.pathname.split('.').pop().toLowerCase();
  const fresh = ['html', 'js', 'mjs', 'css', 'json', 'webmanifest'].includes(ext) ||
    req.mode === 'navigate';

  if (fresh) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Resto (iconos, fuentes, vendor): cache-first.
  event.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
