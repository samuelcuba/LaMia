// ===== LA MIA - SERVICE WORKER v2 =====
// Estrategias: app shell pre-cacheado, imágenes cache-first,
// API de Supabase network-first (catálogo offline), resto network-first.

const CACHE_VERSION = 'la-mia-cache-v2';

// App shell: rutas relativas al propio SW (/LaMia/...)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// --- INSTALL: pre-cachear el app shell (tolera fallos individuales) ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// --- ACTIVATE: borrar cachés antiguos y tomar el control ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_VERSION ? caches.delete(key) : null))
    )
  );
  self.clients.claim();
});

// --- FETCH: estrategia según tipo de recurso ---
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET; ignorar auth/realtime de Supabase
  if (req.method !== 'GET') return;
  if (url.hostname.includes('supabase') && (url.pathname.includes('/auth/') || url.pathname.includes('/realtime'))) return;

  // 1) IMÁGENES (Supabase Storage o cualquier <img>): cache-first con actualización en segundo plano
  if (req.destination === 'image' || url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network; // sirve caché al instante; si no hay, espera red
        })
      )
    );
    return;
  }

  // 2) API REST de Supabase (productos, ventas, cupones, ajustes): network-first con respaldo en caché (catálogo offline)
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

  // 3) DEFAULT (HTML, CDN Tailwind/Supabase JS): network-first, caché y app shell como respaldo
  event.respondWith(
    fetch(req)
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

// ===== NOTIFICACIONES PUSH =====
self.addEventListener('push', event => {
  let payload = { title: 'La Mia 🛒', body: 'Tienes una nueva notificación' };
  try { if (event.data) payload = event.data.json(); } catch (e) { if (event.data) payload.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'La Mia 🛒', {
      body: payload.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: payload.url || '/LaMia/' },
      vibrate: [200, 100, 200],
      tag: 'la-mia-push'
    })
  );
});

// Al hacer clic en la notificación: abrir/enfocar la app
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
