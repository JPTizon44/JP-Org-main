const CACHE_NAME = 'daysync-v5';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon.svg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://unpkg.com/@phosphor-icons/web'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;
    
    // Skip external APIs/Analytics completely if any
    if(event.request.url.includes('google-analytics')) return;

    event.respondWith(
        // NETWORK FIRST STRATEGY (Ideal for active development apps)
        fetch(event.request).then(networkResponse => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
            }

            // Clone the response and update the cache dynamically in the background
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });

            return networkResponse;
        }).catch(() => {
            // IF NETWORK FAILS (Offline mode), fallback to cache
            return caches.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // If it's a page request and not in cache, fallback to index
                if (event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
