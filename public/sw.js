/** Bump when fetch strategy changes so old cache-first JS bundles are dropped (fixes stale Supabase client / zero articles). */
const CACHE_NAME = 'mena-intel-v5';

// Assets to cache immediately on install
const PRECACHE = [
  '/',
  '/feed',
  '/warroom',
  '/nai',
  '/countries',
  '/scenarios',
  '/markets',
  '/disinfo',
  '/social',
  '/timeline',
  '/analytics',
  '/mediaroom',
];

// Install — precache shell pages
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate — delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API/Supabase and for /_next/static (hashed filenames; cache-first caused stale app JS after deploy)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go network for Supabase, API routes, and external resources
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('youtube') ||
    url.hostname.includes('flickr') ||
    url.hostname.includes('googleapis')
  ) {
    return; // default browser fetch
  }

  // Network-first for build assets + PWA shell (avoid serving outdated JS after deploy)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for HTML pages — fall back to cache when offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
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
