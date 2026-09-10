/* EQ Trainer — service worker
 *
 * ⚠ BUMP THIS STRING EVERY TIME YOU CHANGE ANY FILE.
 *   The cache name is the only thing that tells browsers a new version exists.
 *   Forget it and your update reaches nobody: they keep the old cached copy.
 */
const CACHE = 'eqtrainer-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fonts/poppins-400.woff2',
  './fonts/poppins-500.woff2',
  './fonts/poppins-600.woff2',
  './fonts/poppins-700.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* one bad URL must not fail the whole install, so add them individually */
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // never touch cross-origin

  /* Network-first for the page itself so a redeploy is picked up as soon as
     the user is online; cache-first for the static assets. */
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
