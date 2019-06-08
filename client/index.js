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
if (!('WebSocket' in window) || !('fetch' in window) || !Object.assign) {
    const el = document.getElementById('l')
    if (el) el.style.display = 'none'
    appEl.innerHTML = 'Sorry your browser / device is not supported'
} else {

    const {store} = configureStore()

    // add config to the global app object
    _app_.config = config

    // context language
    // we expect the first part of the path to be the language when its length is 2
    let contextLanguage = window.location.pathname.split('/')[1], basePath
    if (contextLanguage && contextLanguage.length === 2) {
        contextLanguage = contextLanguage.toLowerCase()
        _app_.contextPath = '/' + contextLanguage
        basePath = window.location.pathname.substring(3)
    } else {
        _app_.contextPath = ''
        contextLanguage = false
        basePath = window.location.pathname
    }
    basePath += window.location.search + window.location.hash


    // if lang is not set already
    if (!_app_.lang) {
        let lang
        const sessionLanguage = sessionStorage.getItem('lang')
        if (contextLanguage) {
            lang = contextLanguage
        } else {
            if (!sessionLanguage) {
                lang = (navigator.language || navigator.userLanguage).substr(0, 2)
            } else {
                lang = config.DEFAULT_LANGUAGE
            }
        }
        _app_.langBefore = sessionLanguage
        _app_.lang = lang
    }

    if (!contextLanguage && config.DEFAULT_LANGUAGE !== _app_.lang) {
        // add language to url and redirect
        window.location = window.location.origin + '/' + _app_.lang + basePath
    } else {
        // keep language in session
        sessionStorage.setItem('lang', _app_.lang)

        document.documentElement.setAttribute('lang', _app_.lang)

        if (contextLanguage === config.DEFAULT_LANGUAGE) {
            // set canonical link
            DomUtil.createAndAddTag('link', 'head', {
                rel: 'canonical',
                href: window.location.origin + basePath
            })
        }

        // set alternative language
        DomUtil.createAndAddTag('link', 'head', {
            rel: 'alternate',
            hreflang: 'x-default',
            href: window.location.origin + basePath
        })
        for (let i = 0; i < config.LANGUAGES.length; i++) {
            const curLang = config.LANGUAGES[i]
            const isDefault = curLang === config.DEFAULT_LANGUAGE
            DomUtil.createAndAddTag('link', 'head', {
                rel: 'alternate',
                hreflang: curLang,
                href: window.location.origin + (!isDefault ? '/' + curLang : '') + basePath
            })
        }


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
