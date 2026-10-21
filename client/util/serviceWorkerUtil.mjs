export const unregisterAllServiceworker = (callback) => {
    // plain promises instead of async/await: avoids the regenerator runtime in the main bundle (IE11 build)
    navigator.serviceWorker.getRegistrations().then((registrations) =>
        // one after the other, like before
        registrations.reduce((prev, registration) => prev.then(() => registration.unregister()), Promise.resolve())
    ).then(() => {
        // Optional: also clear caches so the next load is guaranteed fresh
        if (self.caches) {
            return caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        }
    }).then(() => {
        if (callback) callback()
    }).catch(() => { if (callback) callback() })  // never block the reload on errors
}