// Names of the two caches used in this version of the service worker.
// Change to vxxx, etc. when you update any of the local resources, which will
// in turn trigger the install event again.
const PRECACHE = 'precache-v${BUILD_NUMBER}'
const RUNTIME = 'runtime-v${BUILD_NUMBER}'

// A list of local resources we always want to be cached.
const PRECACHE_URLS = [
    '/', // Alias for index.html
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
            .then(self.skipWaiting())
    )
})


self.addEventListener('activate', event => {
    const expectedCaches = [PRECACHE, RUNTIME];

    
    // delete any caches that aren't in expectedCaches
    event.waitUntil(
        // clear all caches
        /*caches.keys().then(function(names) {
            for (let name of names)
                caches.delete(name)
        })*/

        // update caches
        caches.keys().then(keys => {
            keys.forEach(key => {
                caches.open(key).then(cache => {
                    cache.keys().then((requests) => {


                        if(key.startsWith('runtime-')) {
                            requests.forEach(async request => {
                                // the cache option set to reload will force the browser to
                                // request any of these resources via the network,
                                // which avoids caching older files again
                                const req = new Request(request.url, {cache: 'reload'})
                                console.log('fetch ' + request.url)
                                fetch(req).then(res => {
                                    if (res && res.status === 200) {
                                        caches.open(RUNTIME).then((cache) => {

                                            console.log('cache ' + request.url)
                                            cache.put(req, res.clone())
                                        })
                                    }
                                })
                            })
                        }

                        if (!expectedCaches.includes(key)) {
                            caches.delete(key).then(()=>{
                                console.log('cache key '+key+' deleted')
                            })
                        }
                    })
                })
            })
        })
    )
})

// The fetch handler serves responses for same-origin resources from a cache.
// If no response is found, it populates the runtime cache with the response
// from the network before returning it to the page.
self.addEventListener('fetch', event => {

    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
        return
    }

    if (event.request.url==='/graphql' || event.request.url.indexOf('/uploads/') >= 0 || event.request.url.indexOf('/lunucapi/') >= 0) {
        return
    }

    // Skip cross-origin requests, like those for Google Analytics.
    if (event.request.method == 'GET' && (event.request.url.startsWith(self.location.origin) ||
            HOSTS.some((host) => event.request.url.startsWith(host))
        )) {


        event.respondWith(
            caches.match(event.request).then((resp) => {
                return resp && !resp.redirected ? resp : fetch(event.request).then((response) => {
                    let responseClone = response.clone()
                    caches.open(RUNTIME).then((cache) => {
                        cache.put(event.request, responseClone)
                    })
                    return response
                })
            })
        )
    }
})
