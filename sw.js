/* My Personal EQ Workbook — service worker
 *
 * ⚠ BUMP THIS STRING EVERY TIME YOU CHANGE ANY FILE.
 *   The cache name is the only thing that tells browsers a new version exists.
 *   Forget it and your update reaches nobody: they keep the old cached copy.
 */
const CACHE = 'eqworkbook-v29';
const FONTS = 'eqworkbook-fonts';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fonts/roh-hangul.woff',
  './js/sketch.js',
  './js/nb.js',
  './js/cursor.js',
  './js/engine.js',
  './js/graph.js',
  './js/app.js',
  './js/share.js'
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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* the hand-lettering comes from Google Fonts: keep a copy so the notebook
     still looks like itself offline */
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit ||
      fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== location.origin) return;   // never touch other cross-origin

  /* Network-first for the page and its code so an edit is picked up on the
     next load; cache-first only for fonts and icons. */
  /* everything of our own is network-first: an edit shows on the next load,
     the cache is only for working offline */
  if (true) {
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
