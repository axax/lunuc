import 'gen/extensions-client'
import React from 'react'
import {render} from 'react-dom'
import App from './components/App'
import configureStore from './store/index'
import config from 'gen/config'

const appEl = document.getElementById('app')
if (!('WebSocket' in window)) {
    const el = document.getElementById('l')
    if (el) el.style.display = 'none'
    appEl.innerHTML = 'Sorry your browser / device is not supported'
} else {


    const {store} = configureStore()

    // add config to the global app object
    _app_.config = config

    // try to detect language
    if (!_app_.lang) {
        var lang = window.location.pathname.split('/')[1]
        if (!lang || lang.length !== 2) {
            lang = (navigator.language || navigator.userLanguage).substr(0, 2)
        } else {
            lang = lang.toLowerCase()
        }
        // to detect a langauge change
        _app_.langBefore = sessionStorage.getItem('lang')
        sessionStorage.setItem('lang', lang)
        _app_.lang = lang
    }
    document.documentElement.setAttribute('lang', _app_.lang)

    const start = () => {
        render(
            <App store={store}/>,
            appEl
        )
    }

    // make sure translations are loaded before start rendering
    if (_app_.trLoaded) {
        start()
    } else {
        // trCallback gets called as soon as translations are loaded
        _app_.trCallback = start
    }


    /* Register serviceworker only on production. only works with https */
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
}
