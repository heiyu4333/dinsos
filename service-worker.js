const CACHE = 'pp-cache-v1';
const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
  , 'icons/icon-192.png'
  , 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : null))).then(() => self.clients.claim()));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    const c = await caches.open(CACHE);
    c.put(req, res.clone());
    return res;
  } catch (e) {
    return caches.match('index.html');
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(r => r || fetch(e.request)));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(cacheFirst(e.request));
  } else {
    e.respondWith(fetch(e.request).then(res => {
      const ctype = res.headers.get('content-type') || '';
      if (res.ok && (ctype.includes('text/') || ctype.includes('application/javascript') || ctype.includes('image/'))) {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }).catch(() => caches.match(e.request)));
  }
});
