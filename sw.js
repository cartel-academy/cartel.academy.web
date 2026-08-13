const CACHE = 'fxcartel-v109';
const ASSETS = [
  'index.html',
  'portal.html',
  'mentors.html',
  'privacy.html',
  'ceo-message.html',
  'tools.html',
  'app.js',
  'manifest.webmanifest',
  'app-notify.js',
  'pwa-install.js',
  'meta-pixel.js',
  'pdfjs/web/viewer.html',
  'pdfjs/web/viewer.mjs',
  'pdfjs/web/viewer.css',
  'pdfjs/build/pdf.mjs',
  'pdfjs/build/pdf.worker.mjs',
  'icons/icon-180-v2.png',
  'icons/icon-192-v2.png',
  'icons/icon-512-v2.png',
  'icons/favicon-48-v2.png',
  'assets/logo.png',
  'assets/logo-dark.png',
  'assets/mentor-salih.jpg',
  'assets/mentor-prajith.jpg',
  'assets/mentor-nishad.jpg',
  'assets/mentor-salgo.jpg',
  'assets/gallery-classroom-wide.jpg',
  'assets/gallery-classroom-empty.jpg',
  'assets/gallery-mentor-teaching.jpg',
  'assets/gallery-lounge.jpg',
  'assets/gallery-classroom-students.jpg',
  'assets/ceo-jeswin-joy.jpg',
  'assets/hero-cartel-academy.jpg',
  'assets/hero-market-bg.jpg',
  'assets/brand-bg.jpg'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) { if ('focus' in client) return client.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('index.html');
    })
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  // Network-first for API calls; cache-first for static assets
  if (request.url.includes('supabase.co')) {
    return; // let network handle it
  }
  // Video is never added to Cache Storage — a multi-MB file going through
  // caches.open(CACHE).then(c=>c.addAll(ASSETS)) on install risks bloating
  // (or, if the fetch fails, silently aborting) the whole precache. Let
  // the browser's own HTTP cache handle it instead, governed by
  // render.yaml's Cache-Control rule for /assets/*.mp4.
  if (request.url.endsWith('.mp4')) {
    return; // let network/browser HTTP cache handle it
  }
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(()=>{});
      return res;
    }).catch(() => {
      // Only fall back to the cached homepage for a failed page navigation
      // (so a user never sees the browser's own offline error page) — doing
      // this for a failed subresource (a blocked/offline third-party script,
      // e.g. a TradingView widget) would hand back HTML where JS/an image
      // was expected, which the browser then fails to parse/execute.
      if (request.mode === 'navigate') return caches.match('index.html');
      return new Response('', { status: 504, statusText: 'Offline' });
    }))
  );
});
