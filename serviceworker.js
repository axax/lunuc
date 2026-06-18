// Names of the two caches used in this version of the service worker.
// Change to vxxx, etc. when you update any of the local resources, which will
// in turn trigger the install event again.
const PRECACHE = 'precache-v${BUILD_NUMBER}'
const RUNTIME = 'runtime-v${BUILD_NUMBER}'

// A list of local resources we always want to be cached.
const PRECACHE_URLS = [
    'main.bundle.js?v=${BUILD_NUMBER}',
    'manifest.json?v=${BUILD_NUMBER}',
    'favicon.ico'
]

// a list of cross origin domains that we want to cache
const HOSTS = [
    'https://fonts.googleapis.com',
    'https://maxcdn.bootstrapcdn.com',
    'https://cdnjs.cloudflare.com',
    'https://firebasestorage.googleapis.com'
]


// The install handler takes care of precaching the resources we always need.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(PRECACHE)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    )
})

// remove old cache if any
self.addEventListener('activate', (event) => {
    const expectedCaches = [PRECACHE, RUNTIME]
    event.waitUntil((async () => {
        const cacheNames = await caches.keys()

        await Promise.all(cacheNames.map(async (cacheName) => {
            if (!expectedCaches.includes(cacheName)) {
                await caches.delete(cacheName)
                console.log('cache key ' + cacheName + ' deleted')
            }
        }))

        // Take control of already open clients without requiring a reload.
        await self.clients.claim()
    })())
})

// The fetch handler serves responses for same-origin resources from a cache.
// If no response is found, it populates the runtime cache with the response
// from the network before returning it to the page.
self.addEventListener('fetch', event => {
    const req = event.request

    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') {
        return
    }

    const { pathname } = new URL(req.url)
    if (pathname === '/graphql' || pathname.startsWith('/uploads/') || pathname.startsWith('/lunucapi/')) {
        return
    }

    if (req.method !== 'GET') {
        return
    }
    if (!(req.url.startsWith(self.location.origin) || HOSTS.some((host) => req.url.startsWith(host)))) {
        return
    }

    // Navigation / HTML documents: network-first so new deploys are picked up
    // immediately. Fall back to the cache only when offline.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).then((response) => {
                const responseClone = response.clone()
                if (response.status === 200 && !response.headers.has('x-no-serviceworker-cache')) {
                    caches.open(RUNTIME).then((cache) => cache.put(req, responseClone))
                }
                return response
            }).catch(async () => {
                // Always resolve to a Response, never undefined.
                const cached = await caches.match(req)
                return cached || Response.error()
            })
        )
        return
    }

    // Everything else (content-hashed chunks, fonts, ...): cache-first,
    // since those URLs are immutable.
    event.respondWith(
        caches.match(req).then((resp) => {
            if (resp && !resp.redirected) {
                return resp
            }
            return fetch(req).then((response) => {
                const responseClone = response.clone()
                if (responseClone && responseClone.status === 200 &&
                    !response.headers.has('x-no-serviceworker-cache')) {
                    caches.open(RUNTIME).then((cache) => {
                        cache.put(req, responseClone)
                    })
                }
                return response
            }).catch((error) => {
                // FIX: must return a Response, otherwise respondWith throws
                // "Failed to convert value to 'Response'".
                console.log(error)
                return Response.error()
            })
        })
    )
})