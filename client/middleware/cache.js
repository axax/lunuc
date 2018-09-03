import {InMemoryCache} from 'apollo-cache-inmemory'
import config from 'gen/config'

const {APOLLO_CACHE} = config
// cache
export const CACHE_KEY = '@APOLLO_OFFLINE_CACHE_'+_app_.lang

export class OfflineCache extends InMemoryCache {
    changeTimeout = 0

    constructor(...args) {
        super(...args)
        if( APOLLO_CACHE ) {
            const startTime = new Date()
            this.restore(JSON.parse(window.localStorage.getItem(CACHE_KEY)))
            console.info(`restore local storage in ${(new Date()-startTime)}ms`)

        }

        window.addEventListener('beforeunload',  (e) => {
            clearTimeout(this.changeTimeout)
            this.saveToLocalStorage()
        })

    }


    saveToLocalStorageDelayed() {
        clearTimeout(this.changeTimeout)
        this.changeTimeout = setTimeout(this.saveToLocalStorage.bind(this),10000)
    }


    saveToLocalStorage() {
        if( APOLLO_CACHE ) {
            const startTime = new Date()
            const state = this.extract()
            // Filter some queries we don't want to persist
            /*const newstate = Object.keys(state)
                .filter(key => (
                        key.indexOf('ROOT_QUERY.login') < 0 &&
                        key.indexOf('ROOT_SUBSCRIPTION') < 0
                    )
                )
                .reduce((res, key) => (res[key] = state[key], res), {})*/
            try {
                window.localStorage.setItem(CACHE_KEY, JSON.stringify(state))
            }catch(e){
                window.localStorage.setItem(CACHE_KEY, '{}')
            }
            console.info(`save to local storage in ${(new Date()-startTime)}ms`)
        }
    }

    broadcastWatches() {
        super.broadcastWatches()
        if( APOLLO_CACHE ) {
            this.saveToLocalStorageDelayed()
        }
    }
}