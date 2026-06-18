export const unregisterAllServiceworker = (callback) => {
    navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for(let i = 0; i < registrations.length; i++){
            await registrations[i].unregister()
        }
        // Optional: also clear caches so the next load is guaranteed fresh
        if (self.caches) {
            const keys = await caches.keys()
            await Promise.all(keys.map(k => caches.delete(k)))
        }
        if (callback) callback()
    }).catch(() => { if (callback) callback() })  // never block the reload on errors
}