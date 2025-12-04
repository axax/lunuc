/* Remove this this line if you don't want to support older browser such as IE 11 */
import 'gen/extensions-client'
import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './components/App'
import config from 'gen/config-client'
import DomUtil from 'client/util/dom.mjs'
import Util from 'client/util/index.mjs'
import {unregisterAllServiceworker} from './util/serviceWorkerUtil.mjs'
import {client} from './middleware/graphql'

const hasStorageSupport = () => {
    try {
        localStorage.setItem('_', '_')
        localStorage.removeItem('_')
        return true
    } catch (e) {
        console.log('Your web browser does not support storing settings locally. In Safari, the most common cause of this is using "Private Browsing Mode". Some settings may not save or some features may not work properly for you.')
        return false
    }
}
_app_.noStorage = !hasStorageSupport()

function addCanonicalTag(href) {
    DomUtil.createAndAddTag('link', 'head', {
        id: 'canonicalTag',
        rel: 'canonical',
        href
    })
}


function mainInit() {
    _app_.contextPath = ''
    _app_.user = {}
    if (!_app_.clientId) {
        _app_.clientId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
    }
    // translation map
    _app_.tr = {}

    // override config
    if (_app_.languages) {
        config.LANGUAGES = _app_.languages
    }

    const LANGUAGES = config.LANGUAGES, DEFAULT_LANGUAGE = config.DEFAULT_LANGUAGE

    // add config to the global app object
    _app_.config = config

    let contextLanguage, loc = window.location, basePath,
        hasMultiLanguages = LANGUAGES && LANGUAGES.length > 1

    // ie fallback
    if (!loc.origin) {
        loc.origin = loc.protocol + "//" + loc.hostname + (loc.port ? ':' + loc.port : '')
    }

    // remove double slashes
    const pathname = loc.pathname
    const cleanPathname = pathname.replace(/\/\/+/g, '/')
    if (cleanPathname !== pathname && loc.protocol !== 'file:') {
        window.location = loc.origin + cleanPathname + loc.search + loc.hash
        return
    }

    // context language
    // we expect the first part of the path to be the language when its length is 2
    contextLanguage = Util.setUrlContext(pathname)
    basePath = Util.removeTrailingSlash(contextLanguage ? pathname.substring(contextLanguage.length + 1) : pathname) + loc.search + loc.hash

    // if multi languages
    if (hasMultiLanguages) {
        // if lang is not set already
        if (!_app_.lang || LANGUAGES.indexOf(_app_.lang) < 0) {
            let lang

            if (contextLanguage) {
                lang = contextLanguage
            } else {
                if (_app_.detectLang) {
                    lang = (navigator.language || navigator.userLanguage).substr(0, 2)
                }
                if (!lang || LANGUAGES.indexOf(lang) < 0) {
                    lang = _app_.defaultLang || DEFAULT_LANGUAGE
                }
            }
            _app_.lang = lang
        }

        if (!contextLanguage && DEFAULT_LANGUAGE !== _app_.lang && basePath !== _app_.redirect404 && loc.protocol !== 'file:') {
            // add language to url and redirect
            window.location = loc.origin + '/' + _app_.lang + (basePath === '/' ? '' : basePath)
            return
        }
    } else {
        _app_.lang = DEFAULT_LANGUAGE
    }

    if (typeof window.CustomEvent === 'function') {
        // Dispatch the custom event on window
        window.dispatchEvent(new CustomEvent('appReady', {detail: {client}}))
    }

    if(_app_.renderApp !== false) {
        const root = createRoot(document.getElementById('app'))
        root.render(<App/>)
    }


    document.documentElement.setAttribute('lang', _app_.lang)

    // set canonical link
    addCanonicalTag(loc.origin + (_app_.lang && _app_.lang !== DEFAULT_LANGUAGE?'/'+_app_.lang:'') + (basePath === '/' ? '' : basePath))

    if (hasMultiLanguages) {

        // set alternative language
        DomUtil.createAndAddTag('link', 'head', {
            rel: 'alternate',
            hreflang: 'x-default',
            href: loc.origin + (basePath === '/' ? '' : basePath)
        })
        for (let i = 0; i < LANGUAGES.length; i++) {
            const curLang = LANGUAGES[i]
            if(curLang !== DEFAULT_LANGUAGE) {
                DomUtil.createAndAddTag('link', 'head', {
                    rel: 'alternate',
                    hreflang: curLang,
                    href: loc.origin + '/' + curLang + (basePath === '/' ? '' : basePath)
                })
            }
        }
    }


    /* Notification.requestPermission(result => {
         console.log(result)
         if (result === 'granted') {
             navigator.serviceWorker.ready.then(registration => {
                 console.log(registration)
                 registration.showNotification('Vibration Sample', {
                     body: 'Buzz! Buzz!',
                     tag: 'vibration-sample'
                 });
             });
         }
     });*/

    /* Register serviceworker only on production. only works with https */
    if (_app_.installServiceWorker !== false && 'serviceWorker' in navigator) {
        console.log('Service Worker is supported')

        if ('PushManager' in window) {
            console.log('Push is supported')
            if (config.DEV_MODE || location.host.startsWith('localhost')) {
                unregisterAllServiceworker()
            } else {

                navigator.serviceWorker.register('/serviceworker.js?v=' + config.BUILD_NUMBER)
                    .then(async (swReg) => {
                        console.log('Service Worker is registered')
                        await swReg.update()
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

if (!window.LUNUC_PREPARSED) {
    const morePolyfill = !window.fetch || !window.AbortController || !window.Event || typeof String.prototype.replaceAll !== 'function'

    _app_.lacksBasicEs6 = morePolyfill && (() => {
        try {
            new Function('(a={x:1})=>{const {x}=a;let b=1;}')
            return false
        } catch (err) {
            console.log(err)
            return true
        }
    })()

    _app_.lacksOptionalChaining = _app_.lacksBasicEs6 || (() => {
            try {
                new Function('window?.b')
                return false
            } catch (err) {
                console.log(err)
                return true
            }
        })()

   // _app_.lacksOptionalChaining = _app_.lacksBasicEs6 = true



    let maxCounter = 0, counter = 0
    const onload = () => {
        counter++
        if (counter === maxCounter) {
            mainInit()
        }
    }
    if (morePolyfill) {

        maxCounter++
        DomUtil.addScript('/polyfill/more.js', {
            async: true,
            onload
        })


        if(!window.Intl || !Intl.DateTimeFormat || !Intl.DateTimeFormat().resolvedOptions().timeZone){
            maxCounter++
            DomUtil.addScript('/polyfill/intl.js', {
                async: true,
                onload
            })
        }
    }

    if (_app_.lacksBasicEs6 || _app_.lacksOptionalChaining) {
        maxCounter++
        // Load polyfill and bable to support old browsers
        DomUtil.addScript('/legacyjs.js', {
            async: true,
            onload
        })
    }

    if (maxCounter === 0) {
        mainInit()
    }
}
