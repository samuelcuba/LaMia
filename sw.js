// ===== LA MIA - SERVICE WORKER v2 =====
const CACHE_VERSION = 'la-mia-cache-v2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// --- INSTALL ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// --- ACTIVATE ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_VERSION ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

// --- FETCH ---
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase') && (url.pathname.includes('/auth/') || url.pathname.includes('/realtime'))) return;

  // Imágenes: cache-first
  if (req.destination === 'image' || (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/'))) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // API Supabase: network-first
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        fetch(req)
          .then(res => { if (res && res.status === 200) cache.put(req, res.clone()); return res; })
          .catch(() => cache.match(req))
      )
    );
    return;
  }

  // Default: network-first, fallback a caché o index.html
  event.respondWith(
    fetch(req)
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

// ===== NOTIFICACIONES PUSH =====
self.addEventListener('push', event => {
  console.log('[SW] Push recibido en:', new Date().toISOString()); // 👈 Log para depurar
  let payload = { title: 'La Mia 🛒', body: 'Tienes una nueva notificación' };
  try { if (event.data) payload = event.data.json(); } catch (e) { if (event.data) payload.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'La Mia 🛒', {
      body: payload.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: payload.url || '/LaMia/' },
      vibrate: [200, 100, 200],
      tag: 'la-mia-push',
      // requireInteraction: true // Descomenta si quieres que la notificación permanezca
    })
  );
});

// ===== CLIC EN NOTIFICACIÓN =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/LaMia/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ===== MANTENER SW ACTIVO (HEARTBEAT) =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'PING') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage('PONG');
    }
  }
});
