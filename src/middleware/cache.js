import {InMemoryCache} from 'apollo-cache-inmemory'
import Environment from '../environment'

// cache
const CACHE_KEY = "@APOLLO_OFFLINE_CACHE";

export class OfflineCache extends InMemoryCache {
    constructor(...args) {
        super(...args);
        if( Environment.APOLLO_CACHE ) {
            this.restore(JSON.parse(window.localStorage.getItem(CACHE_KEY)))
        }
    }

    changeTimeout = 0

    saveToLocalStorageDelayed() {
        clearTimeout(this.changeTimeout)
        this.changeTimeout = setTimeout(this.saveToLocalStorage.bind(this),5000)
    }


    saveToLocalStorage() {
        const state = this.extract();
        // Filter some queries we don't want to persist
        const newstate = Object.keys(state)
            .filter(key => (
                    key.indexOf('$ROOT_QUERY.login') < 0 &&
                    key.indexOf('ROOT_QUERY.notification') < 0 &&
                    key.indexOf('ROOT_SUBSCRIPTION.notification') < 0
                )
            )
            .reduce((res, key) => (res[key] = state[key], res), {})

        console.log("save to local storage");
        window.localStorage.setItem(CACHE_KEY,JSON.stringify(newstate))
    }

    broadcastWatches() {
        super.broadcastWatches();
        if( Environment.APOLLO_CACHE ) {
            this.saveToLocalStorageDelayed();
        }
    }
}