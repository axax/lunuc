// util/browserSupport.mjs
//
// Single place that decides what an (old) browser gets delivered. Every browser gets something:
//
//  1. javascript app: the client bundle is compiled to ES5 (babel.config.json, "ie 11" in the
//     targets) and gets its missing runtime features from /polyfill/base.js, /polyfill/more.js,
//     /polyfill/intl.js and /legacyjs*.js (see client/index.js)
//  2. server side rendered page: browsers below MIN_JS_VERSION can't run the bundle at all and
//     get the prerendered html without scripts (server/server.mjs sendIndexFile). Browsers that
//     slip through the user agent check (unknown agents, missing ES5 basics, errors while the
//     bundle starts) switch to it on their own: the inline script in index.html / index.min.html
//     sets the SSR_FALLBACK_COOKIE and reloads the page
//  3. http instead of https: browsers below MIN_TLS_VERSION can't open the https site (no TLS 1.2,
//     root certificate of the current certificates unknown) and are not redirected to https.
//     The same for operating systems below MIN_OS_VERSION_FOR_TLS (see there)
//
// The browser names are the ones of parseUserAgent (util/userAgent.mjs). Browsers that are not
// listed (or not detected) count as supported.

// first version that runs the ES5 bundle
export const MIN_JS_VERSION = {
    netscape: Infinity,
    msie: 11,
    safari: 5,
    firefox: 13,
    chrome: 17,
    opera: 11
}

// first version with TLS 1.2 and a certificate store that trusts the current certificates
export const MIN_TLS_VERSION = {
    netscape: Infinity,
    msie: 11,
    safari: 7,
    firefox: 27,
    chrome: 50,
    opera: 16
}

// agents that never run the client bundle, whatever their version: text browsers (no javascript
// at all) and proxy browsers that only run javascript briefly on their server (Opera Mini).
// Tested against the lower case user agent
export const NO_JS_AGENT_REGEX = /^(lynx|w3m|links|elinks|dillo|netsurf|emacs-w3|ncsa[ _]mosaic|amaya|arachne)\b|\bopera mini\b/

// first operating system version that trusts ISRG Root X1, the root of the Let's Encrypt
// certificates. Older systems only worked with the cross signed chain (DST Root CA X3), which
// ended in 2024. Browsers using the certificate store of the system fail there with a
// certificate error. Not needed with certificates of an older root - http is then served
// unnecessarily, but the site still works
export const MIN_OS_VERSION_FOR_TLS = {
    android: [7, 1, 1],
    ios: [10],
    macos: [10, 12, 1]
}

// browsers with their own certificate store (Firefox has ISRG Root X1 since version 50, which is
// below MIN_TLS_VERSION anyway). On iOS every browser has to use the system store
const OWN_CERT_STORE_BROWSERS = {firefox: true}

// negative if version a is lower than version b ([7, 0] < [7, 1, 1]), missing parts count as 0
export const compareVersions = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] || 0) - (b[i] || 0)
        if (d !== 0) {
            return d
        }
    }
    return 0
}

const hasOutdatedCertStore = ({browser, os, osVersion}) => {
    const min = os && MIN_OS_VERSION_FOR_TLS[os]
    return !!min && !!osVersion && compareVersions(osVersion, min) < 0 &&
        !(os !== 'ios' && OWN_CERT_STORE_BROWSERS[browser])
}

// set by the inline script of the index html, see 2. above
export const SSR_FALLBACK_COOKIE = 'lunucSsr'

const isBelow = (minVersions, browser, version) => {
    const min = minVersions[browser]
    return min !== undefined && (min === Infinity || version < min)
}

// true if the browser can't run the client bundle -> server side rendering
export const needsServerSideRendering = ({browser, version} = {}) => isBelow(MIN_JS_VERSION, browser, version)

// true if the agent can't run the client bundle at all, independent of its version
export const isNoJsAgent = (agentLower) => !!agentLower && NO_JS_AGENT_REGEX.test(agentLower)

// true if the browser can't open the site over https -> deliver it over http.
// Expects the result of parseUserAgent (browser, version, os, osVersion)
export const needsInsecureHttp = (ua = {}) => isBelow(MIN_TLS_VERSION, ua.browser, ua.version) || hasOutdatedCertStore(ua)

const SSR_FALLBACK_COOKIE_REGEX = new RegExp('(?:^|;\\s*)' + SSR_FALLBACK_COOKIE + '=1(?:;|$)')

// true if the browser asked for the server side rendered page itself (cookie of the index html script)
export const hasSsrFallbackCookie = (req) => {
    const cookie = req.headers && req.headers.cookie
    return !!cookie && SSR_FALLBACK_COOKIE_REGEX.test(cookie)
}
