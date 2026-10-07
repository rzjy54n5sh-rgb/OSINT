/**
 * Bump CACHE_NAME whenever the caching rules change: `activate` deletes every
 * other cache, so entries stored under older rules are purged.
 * v8: never store private / no-store / error responses or account, admin,
 *     auth, API and RSC requests (v6/v7 stored every same-origin GET,
 *     including signed-in /account HTML), and no install-time precache.
 */
const CACHE_NAME = 'mena-intel-v8';

// No install-time precache: the pages are dynamic (and mostly no-store), and
// each precached URL is an extra counted Worker request on every install.
// Pages are cached on visit when their response allows it (see isCacheable).

// Same-origin paths that must never touch Cache Storage (per-user / auth / API).
const PRIVATE_PATH = /^\/(account|admin|auth|api|login|forgot-password|reset-password)(\/|$)/;

function isBypassRequest(request, url) {
  if (url.origin !== self.location.origin || request.method !== 'GET') return true;
  if (PRIVATE_PATH.test(url.pathname)) return true;
  // React Server Component payloads / router prefetches (per-navigation, may be user-specific)
  if (url.searchParams.has('_rsc')) return true;
  if (request.headers.get('RSC') === '1' || request.headers.has('Next-Router-Prefetch')) return true;
  return false;
}

function isCacheable(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  if (response.redirected) return false;
  const cc = (response.headers.get('Cache-Control') || '').toLowerCase();
  if (cc.includes('no-store') || cc.includes('private')) return false;
  return true;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — delete every cache except the current one
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cross-origin (map tiles, YouTube, Stripe, Supabase, analytics), non-GET,
  // private paths and RSC requests go straight to the browser: not cached, and
  // the page CSP (not this worker's own CSP) governs cross-origin fetches.
  if (isBypassRequest(request, url)) return;

  // Network-first for everything else (hashed build assets, icons, public
  // pages); store only responses that allow it; fall back to cache offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isCacheable(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || Response.error()))
  );
});

// Push notifications support (for future use)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'MENA Intel Desk', {
      body: data.body || 'New intelligence update',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
