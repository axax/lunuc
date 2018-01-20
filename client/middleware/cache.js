import {InMemoryCache} from 'apollo-cache-inmemory'
import logger from 'util/logger'
import {APOLLO_CACHE} from 'gen/config'

// cache
const CACHE_KEY = '@APOLLO_OFFLINE_CACHE'

export class OfflineCache extends InMemoryCache {
    logger = logger(this.constructor.name)
    changeTimeout = 0

    constructor(...args) {
        super(...args)
        if( APOLLO_CACHE ) {
            this.logger.debug('restore local storage')
            this.restore(JSON.parse(window.localStorage.getItem('@APOLLO_OFFLINE_CACHE')))
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
            const state = this.extract()
            // Filter some queries we don't want to persist
            const newstate = Object.keys(state)
                .filter(key => (
                        key.indexOf('ROOT_QUERY.login') < 0 &&
                        key.indexOf('ROOT_QUERY.notification') < 0 &&
                        key.indexOf('ROOT_SUBSCRIPTION.notification') < 0
                    )
                )
                .reduce((res, key) => (res[key] = state[key], res), {})
            this.logger.debug('save to local storage')
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(state))
        }
    }

    broadcastWatches() {
        super.broadcastWatches()
        if( APOLLO_CACHE ) {
            this.saveToLocalStorageDelayed()
        }
    }
}