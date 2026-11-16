/**
 * Soft 404 (page exists, but its content doesn't - e.g. unknown product).
 *
 * Redirects to the 404 url, which the server answers with a real 404 status code. This is the
 * strategy google recommends for client side rendering, and web2html (prerendering for bots)
 * detects the redirect as well. The original url is passed along:
 *   /404?from=<path+search>&ref=<referer>
 * - the tracking stores "from" as path (see extensions/usertracking/track.mjs)
 * - the client restores "from" in the address bar right after loading (see client/index.js),
 *   the visitor sees the error page under the url he opened
 * location.replace: the dead url is not kept in the history (no back button loop)
 *
 * Inside web2html (prerendering for bots) there is no redirect, see below.
 */
export const redirectTo404 = () => {
    if (typeof window === 'undefined' || !window._app_) return
    const target = _app_.redirect404 || '/404'
    if (location.pathname === target) return
    if (window._lunucWebParser) {
        // prerendering for bots (server/util/web2html.mjs): no second navigation. web2html reads
        // the flag after rendering and answers with 404, the html of the page is not used then.
        // The 404 is tracked by server.mjs (bots never get the js, so they can't run into
        // the client side case)
        _app_.show404 = true
        _app_.show404Path = location.pathname
        return
    }
    let referer = ''
    try {
        const urlStack = _app_.history && _app_.history._urlStack
        referer = urlStack && urlStack.length > 1 ? location.origin + urlStack[1] : (document.referrer || '')
    } catch (e) {
    }
    location.replace(target + '?from=' + encodeURIComponent(location.pathname + location.search) +
        (referer ? '&ref=' + encodeURIComponent(referer.substring(0, 1000)) : ''))
}
