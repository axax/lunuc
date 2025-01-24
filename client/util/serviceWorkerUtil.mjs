
export const unregisterAllServiceworker = () => {
    navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for (let registration of registrations) {
            await registration.unregister()
        }
    })
}
