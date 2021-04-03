/* Remove this this line if you don't want to support older browser such as IE 11 */
import 'gen/extensions-client'
import React from 'react'
import {render} from 'react-dom'
import App from './components/App'
import {getStore} from './store/index'
import config from 'gen/config-client'
import DomUtil from 'client/util/dom'

if (typeof localStorage === 'object') {
    // for ios 9.3.5
    try {
        localStorage.setItem('localStorage', 1)
        localStorage.removeItem('localStorage')
    } catch (e) {
        Storage.prototype.setItem = function () {
        }
        console.log('Your web browser does not support storing settings locally. In Safari, the most common cause of this is using "Private Browsing Mode". Some settings may not save or some features may not work properly for you.')
    }
}

function removeTrailingSlash(url) {
    // has trailing slash
    if (url !== '/' && url.lastIndexOf('/') === url.length - 1) {
        url = url.substring(0, url.length - 1)
    }
    return url
}

function addCanonicalTag(href) {
    DomUtil.createAndAddTag('link', 'head', {
        id: 'canonicalTag',
        rel: 'canonical',
        href
    })
}

function mainInit() {
    const store = getStore()

    // translation map
    _app_.tr = {}
    _app_.JsonDom = {}

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
    const cleanPathname = loc.pathname.replace(/\/\/+/g, '/')
    if (cleanPathname !== loc.pathname && loc.protocol !== 'file:') {
        window.location = loc.origin + cleanPathname + loc.search + loc.hash
        return
    }

    // context language
    // we expect the first part of the path to be the language when its length is 2
    contextLanguage = loc.pathname.split('/')[1].toLowerCase()

    if (contextLanguage && LANGUAGES.indexOf(contextLanguage) >= 0) {
        _app_.contextPath = '/' + contextLanguage
        basePath = removeTrailingSlash(loc.pathname.substring(contextLanguage.length + 1))
    } else {
        _app_.contextPath = ''
        contextLanguage = false
        basePath = removeTrailingSlash(loc.pathname)
    }
    basePath += loc.search + loc.hash

    // if multi languages
    if (hasMultiLanguages) {
        // if lang is not set already
        if (!_app_.lang || LANGUAGES.indexOf(_app_.lang) < 0) {
            let lang
            const sessionLanguage = sessionStorage.getItem('lang')
            if (contextLanguage) {
                lang = contextLanguage
            } else {
                if (!sessionLanguage && _app_.detectLang) {
                    lang = (navigator.language || navigator.userLanguage).substr(0, 2)
                }
                if (!lang || LANGUAGES.indexOf(lang) < 0) {
                    lang = DEFAULT_LANGUAGE
                }
            }
            _app_.langBefore = sessionLanguage
            _app_.lang = lang
        }

        if (!contextLanguage && DEFAULT_LANGUAGE !== _app_.lang && basePath !== _app_.redirect404 && loc.protocol !== 'file:') {
            // add language to url and redirect
            window.location = loc.origin + '/' + _app_.lang + (basePath === '/' ? '' : basePath)
            return
        }

        // keep language in session
        sessionStorage.setItem('lang', _app_.lang)

    } else {
        _app_.lang = DEFAULT_LANGUAGE
    }

    render(
        <App store={store}/>,
        document.getElementById('app')
    )


    document.documentElement.setAttribute('lang', _app_.lang)


    // has trailing slash --> set canonical link of seo
    const cleanPathnameWithoutTrailingSlash = removeTrailingSlash(cleanPathname)
    if (cleanPathnameWithoutTrailingSlash !== cleanPathname) {
        addCanonicalTag(loc.origin + cleanPathnameWithoutTrailingSlash + loc.search + loc.hash)
    }

    if (contextLanguage === DEFAULT_LANGUAGE) {
        // set canonical link
        addCanonicalTag(loc.origin + (basePath === '/' ? '' : basePath))
    }
    if (hasMultiLanguages) {

        // set alternative language
        DomUtil.createAndAddTag('link', 'head', {
            rel: 'alternate',
            hreflang: 'x-default',
            href: loc.origin + (basePath === '/' ? '' : basePath)
        })
        for (let i = 0; i < LANGUAGES.length; i++) {
            const curLang = LANGUAGES[i]
            const isDefault = curLang === DEFAULT_LANGUAGE
            DomUtil.createAndAddTag('link', 'head', {
                rel: 'alternate',
                hreflang: curLang,
                href: loc.origin + (!isDefault ? '/' + curLang : '') + (basePath === '/' ? '' : basePath)
            })
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
                navigator.serviceWorker.register('/serviceworker.js?v=' + config.BUILD_NUMBER)
                    .then(function (swReg) {
                        console.log('Service Worker is registered')
                        setTimeout(() => {
                            swReg.update()
                        }, 5000)
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
    const noneBasicEs6 = (() => {
            if (window.fetch) {
                return false
            }
            try {
                new Function('(a={x:1})=>{const {x}=a;let b=1;return `${a}`}')
                return false
            } catch (err) {
                return true
            }
        })(),
        noneObject = !Object.assign || !Object.values || !window.fetch || !window.AbortController || !window.Event || !window.Promise || !Promise.prototype.finally

    let maxCounter = 0, counter = 0
    const onload = () => {
        counter++
        if (counter === maxCounter) {
            mainInit()
        }
    }
    if (noneBasicEs6) {
        maxCounter++
        // Load polyfill and bable to support old browsers
        DomUtil.addScript('/babel.min.js', {
            async: true,
            onload
        })
    }

    if (noneObject) {
        maxCounter++
        let ua
        if (navigator.userAgent.indexOf('PaleMoon') !== -1) {
            ua=navigator.userAgent.replace('Firefox/','')
        }
        DomUtil.addScript('https://polyfill.io/v3/polyfill.min.js?features=fetch%2CURL%2Ces6%2CObject.values%2CPromise.prototype.finally%2CAbortController%2CEvent'+(ua?'&ua='+ua:''), {
            async: true,
            onload
        })
    }

    if (!window.Intl || !Intl.DateTimeFormat() || !Intl.DateTimeFormat().resolvedOptions().timeZone) {
        maxCounter++
        // timezone support
        DomUtil.addScript('/date-time-format-timezone-min.js', {
            async: true,
            onload
        })
    }

    if (maxCounter === 0) {
        mainInit()
    }
}
