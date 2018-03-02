import 'gen/extensions-client'
import React from 'react'
import {render} from 'react-dom'
import App from './components/App'
import configureStore from './store/index'
import config from 'gen/config'
const {store} = configureStore()

// add config to the global app object
_app_.config = config

const start = () => {
    render(
        <App store={store}/>,
        document.getElementById('app')
    )
}

// make sure translations are loaded before start rendering
if (_app_.trLoaded) {
    start()
} else {
    // trCallback gets called as soon as translations are loaded
    _app_.trCallback = start
}


/* Register serviceworker only on production */
if ('serviceWorker' in navigator) {
    console.log('Service Worker is supported')

    if ('PushManager' in window) {
        console.log('Push is supported')

        if (config.DEV_MODE) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                for (let registration of registrations) {
                    registration.unregister()
                }
            })
        } else {
            navigator.serviceWorker.register('/serviceworker.js')
                .then(function (swReg) {
                    console.log('Service Worker is registered', swReg)
                })
                .catch(function (error) {
                    console.error('Service Worker Error', error)
                })
        }
    } else {
        console.warn('Push is not supported')
    }


} else {
    console.warn('Service Worker is not supported')
}
