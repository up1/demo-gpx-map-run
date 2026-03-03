const CACHE_NAME = 'gpx-viewer-v1';

// App shell resources to cache on install
const APP_SHELL = [
    '/',
    '/index.html',
    '/app.js',
    '/styles.css',
    '/manifest.json',
    '/icons/icon.svg',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Install — cache the app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

// Activate — clean up old caches
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

// Fetch — cache-first for app shell, network-first for API calls
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Network-first for API requests (GPX file listing and content)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache a copy of successful API responses
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Cache-first for all other resources (app shell, Leaflet, map tiles)
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request).then((response) => {
                // Only cache successful same-origin or CORS responses
                if (
                    response.ok &&
                    (url.origin === self.location.origin ||
                        url.hostname.includes('unpkg.com') ||
                        url.hostname.includes('tile.openstreetmap.org') ||
                        url.hostname.includes('cloudflare.com') ||
                        url.hostname.includes('githubusercontent.com'))
                ) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            });
        })
    );
});
