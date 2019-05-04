/* Remove this this line if you don't want to support older browser such as IE 11 */
//import './polyfill'
import 'gen/extensions-client'
import React from 'react'
import {render} from 'react-dom'
import App from './components/App'
import configureStore from './store/index'
import config from 'gen/config'
import DomUtil from 'client/util/dom'

const appEl = document.getElementById('app')
if (!('WebSocket' in window) || !Object.assign) {
    const el = document.getElementById('l')
    if (el) el.style.display = 'none'
    appEl.innerHTML = 'Sorry your browser / device is not supported'
} else {

    const {store} = configureStore()

    // add config to the global app object
    _app_.config = config

    // context language
    let contextLanguage = window.location.pathname.split('/')[1]
    if (contextLanguage && contextLanguage.length === 2) {
        contextLanguage = contextLanguage.toLowerCase()
    } else {
        contextLanguage = false
    }

    // try to detect language
    if (!_app_.lang) {
        console.log(sessionStorage.getItem('lang'))
        let lang
        if (contextLanguage) {
            lang = contextLanguage
        } else {
            if (!sessionStorage.getItem('lang')) {
                lang = (navigator.language || navigator.userLanguage).substr(0, 2)
            } else {
                lang = config.DEFAULT_LANGUAGE
            }
        }
        // to detect a langauge change
        _app_.langBefore = sessionStorage.getItem('lang')
        sessionStorage.setItem('lang', lang)
        _app_.lang = lang
    }

    if (config.DEFAULT_LANGUAGE !== _app_.lang && contextLanguage !== _app_.lang) {
        // add language to url and redirect
        window.location = window.location.origin + '/' + _app_.lang + window.location.pathname + window.location.search + window.location.hash
    } else {
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
}
