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
        caches.open(PRECACHE).then(async (cache) => {
            // allSettled instead of addAll: a single failing URL (e.g. a new
            // bundle not yet uploaded during the deploy window) must not abort
            // the whole installation.
            await Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
        }).then(() => self.skipWaiting())
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

        // No clients.claim(): a running page keeps its original controller,
        // so the new worker never takes over mid-load.
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

    // req.url is always absolute, so compare against the pathname.
    const { pathname } = new URL(req.url)
    if (pathname === '/graphql' || pathname.startsWith('/uploads/') || pathname.startsWith('/lunucapi/')) {
        return
    }

    // Only handle same-origin or explicitly allowed cross-origin GET requests.
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
                // Must return a Response, otherwise respondWith throws
                // "Failed to convert value to 'Response'".
                console.log(error)
                return Response.error()
            })
        })
    )
})
/*
 * Web push (extensions/push). The payload is the notification as JSON:
 * {title, body, url, icon, badge, image, tag, renotify, silent, requireInteraction, skipIfFocused, data}
 * skipIfFocused: not shown while a window showing the url (or a sub path of it; a string = that
 * path prefix instead) has the focus - the page then shows the news itself.
 */
self.addEventListener('push', event => {
    let n = {}
    try {
        n = event.data ? event.data.json() : {}
    } catch (e) {
        n = {body: event.data ? event.data.text() : ''}
    }
    event.waitUntil((async () => {
        if (n.skipIfFocused) {
            const prefix = n.skipIfFocused === true ? n.url : n.skipIfFocused
            const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true})
            if (prefix && windows.some(c => c.focused && new URL(c.url).pathname.indexOf(prefix) === 0)) {
                return
            }
        }
        await self.registration.showNotification(n.title || self.location.hostname, {
            body: n.body,
            icon: n.icon || '/favicon-192x192.png',
            badge: n.badge,
            image: n.image,
            tag: n.tag,
            renotify: !!n.tag && n.renotify !== false,
            silent: !!n.silent,
            requireInteraction: !!n.requireInteraction,
            data: {...(n.data || {}), url: n.url}
        })
    })())
})

// Click on a notification of the service worker (web push, or pages on Android, where a page
// can't create notifications itself): focus an open window and show the url of the
// notification (options.data.url) there, otherwise open a new window.
self.addEventListener('notificationclick', event => {
    event.notification.close()
    const url = event.notification.data && event.notification.data.url
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true})
        const client = windows.find(c => c.focused) || windows.find(c => 'focus' in c)
        if (client) {
            await client.focus().catch(() => {})
            if (url) {
                // handled by the page without a reload (extensions/push/util/pushClient.js)
                client.postMessage({type: 'lunuc-push-navigate', url})
            }
        } else if (url && self.clients.openWindow) {
            await self.clients.openWindow(url)
        }
    })())
})
