const CACHE_NAME = 'lunuc-serviceworker-cache-v1';
const CACHE_FILES = [
    '/index.html',
    '/vendor.bundle.js',
    '/main.bundle.js',
]

self.addEventListener('install', event => {
    console.log("[sw.js] Install event.");
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_FILES))
            .then(self.skipWaiting())
            .catch(err => console.error("[sw.js] Error trying to pre-fetch cache files:", err))
    )
})

/*
self.addEventListener('activate', event => {
    console.log("[sw.js] Activate event.");
    event.waitUntil(
        self.clients.claim()
    );
})*/

self.addEventListener('fetch', function(event) {
    //    if (!event.request.url.startsWith(self.location.origin)) return
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request)
        })
    )
})