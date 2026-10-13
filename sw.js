/* Recipe Tidy service worker: makes the app installable and usable offline.
 * Bump VERSION whenever you upload new files so phones pick up the update. */
const VERSION = 'v1';
const SHELL = `recipe-tidy-shell-${VERSION}`;
const LIBS = 'recipe-tidy-libs';
const FILES = [
  './', 'index.html', 'manifest.json', 'css/styles.css',
  'js/parser.js', 'js/extract.js', 'js/translate.js', 'js/translate-worker.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('recipe-tidy-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App files: try the network first so updates show up, fall back to the saved copy offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  // Helper libraries and fonts (versioned URLs): save once, reuse forever.
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(LIBS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
  // Everything else (Hugging Face models, Anthropic API) passes straight through.
});
