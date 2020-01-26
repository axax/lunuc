/* Remove this this line if you don't want to support older browser such as IE 11 */
//import './polyfill'
import 'gen/extensions-client'
import React from 'react'
import {render} from 'react-dom'
import App from './components/App'
import configureStore from './store/index'
import config from 'gen/config'
import DomUtil from 'client/util/dom'

function mainInit() {
    const {store} = configureStore()

    // override config
    if (_app_.languages) {
        config.LANGUAGES = _app_.languages
    }

    // add config to the global app object
    _app_.config = config

    let contextLanguage, loc = window.location, basePath,
        hasMultiLanguages = config.LANGUAGES && config.LANGUAGES.length > 1

    // if multi languages
    if (hasMultiLanguages) {

        // context language
        // we expect the first part of the path to be the language when its length is 2
        contextLanguage = loc.pathname.split('/')[1]

        if (contextLanguage && config.LANGUAGES.indexOf(contextLanguage) >= 0) {
            contextLanguage = contextLanguage.toLowerCase()
            _app_.contextPath = '/' + contextLanguage
            basePath = loc.pathname.substring(contextLanguage.length + 1)
        } else {
            _app_.contextPath = ''
            contextLanguage = false
            basePath = loc.pathname
        }
        basePath += loc.search + loc.hash

        // if lang is not set already
        if (!_app_.lang || config.LANGUAGES.indexOf(_app_.lang) < 0) {
            let lang
            const sessionLanguage = sessionStorage.getItem('lang')
            if (contextLanguage) {
                lang = contextLanguage
            } else {
                if (!sessionLanguage && _app_.detectLang) {
                    lang = (navigator.language || navigator.userLanguage).substr(0, 2)
                }
                if (!lang || config.LANGUAGES.indexOf(lang) < 0) {
                    lang = config.DEFAULT_LANGUAGE
                }
            }
            _app_.langBefore = sessionLanguage
            _app_.lang = lang
        }

        if (!contextLanguage && config.DEFAULT_LANGUAGE !== _app_.lang) {
            // add language to url and redirect
            window.location = loc.origin + '/' + _app_.lang + basePath
            return
        }

        // keep language in session
        sessionStorage.setItem('lang', _app_.lang)

    } else {
        _app_.contextPath = ''
        _app_.lang = config.DEFAULT_LANGUAGE
    }

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

    document.documentElement.setAttribute('lang', _app_.lang)

    if(hasMultiLanguages){
        if (contextLanguage === config.DEFAULT_LANGUAGE) {
            // set canonical link
            DomUtil.createAndAddTag('link', 'head', {
                rel: 'canonical',
                href: loc.origin + basePath
            })
        }

        // set alternative language
        DomUtil.createAndAddTag('link', 'head', {
            rel: 'alternate',
            hreflang: 'x-default',
            href: loc.origin + basePath
        })
        for (let i = 0; i < config.LANGUAGES.length; i++) {
            const curLang = config.LANGUAGES[i]
            const isDefault = curLang === config.DEFAULT_LANGUAGE
            DomUtil.createAndAddTag('link', 'head', {
                rel: 'alternate',
                hreflang: curLang,
                href: loc.origin + (!isDefault ? '/' + curLang : '') + basePath
            })
        }
    }
    /* Register serviceworker only on production. only works with https */
    if ('serviceWorker' in navigator) {
        console.log('Service Worker is supported')

        if ('PushManager' in window) {
            console.log('Push is supported')


            if (config.DEV_MODE || location.host.startsWith('localhost')) {

                navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    for (let registration of registrations) {
                        registration.unregister()
                    }
                })
            } else {

                //window.Notification.requestPermission()


                navigator.serviceWorker.register('/serviceworker.js?v=' + config.BUILD_NUMBER)
                    .then(function (swReg) {
                        console.log('Service Worker is registered')
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


if (!Object.assign || !window.fetch || !window.Map) {

    let counter = 0
    const onload = () => {
        counter++
        if (counter === 2) {
            mainInit()
        }
    }
    // Load polyfill and bable in order to support old browsers
    DomUtil.addScript('https://unpkg.com/babel-standalone@6.26.0/babel.min.js', {
        async: true,
        onload
    })

    DomUtil.addScript('https://polyfill.io/v3/polyfill.min.js?features=fetch%2CURL%2Ces6%2CMap', {
        async: true,
        onload
    })
} else {
    mainInit()
}
