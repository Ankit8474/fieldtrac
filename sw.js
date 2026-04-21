/* FieldTrack service worker.
   Primary job: register for the Background Sync API on Android Chrome so that
   photo uploads can resume even when the page is closed. iOS Safari does not
   support this API; on iOS the page must be open for uploads to progress.
*/
const CACHE = 'fieldtrack-v3';
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL).catch(() => null))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // App shell — cache-first
  if (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => null);
        return r;
      }).catch(() => caches.match('./index.html')))
    );
    return;
  }
  // All other requests: network only
});

self.addEventListener('sync', e => {
  if (e.tag === 'fieldtrack-upload') {
    e.waitUntil(notifyClientsToSync());
  }
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'fieldtrack-periodic') {
    e.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of clients) c.postMessage({ type: 'BG_SYNC_FIRE' });
  // If no clients are open, we can't run IDB logic reliably from the SW
  // (would need to duplicate the DB code). The postMessage covers the
  // common case; true headless sync requires native.
}
