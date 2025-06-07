
export const unregisterAllServiceworker = (callback) => {
    navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        for(let i = 0; i < registrations.length; i++){
            await registrations[i].unregister()
        }
        if(callback){
            callback()
        }
    })
}
