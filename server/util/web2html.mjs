// server/util/web2html.mjs
//
// Server-side rendering via a persistent Puppeteer browser.
//
// Design: one long-lived browser instance, one page per render. Resource
// loading (images, styles, fonts, media) is blocked, navigation waits for
// domcontentloaded + an explicit app readiness signal instead of
// networkidle2. Hung CDP connections are detected via timeouts on every
// browser call; repeated failures trigger a full browser restart
// (SIGKILL as last resort).
//
// Concurrency: the render semaphore in server/index.mjs (renderOnce +
// acquireRenderSlot, LUNUC_SSR_CONCURRENCY) is the actual concurrency
// control in front of this module. The isTemporarilyBlocked call below is
// only an emergency brake and should never fire in normal operation.
//
// Page leak handling (escalation ladder, in order):
//   1. browser unhealthy (CDP unresponsive) -> kill browser
//   2. browser healthy but too many pages   -> close leaked (oldest) pages
//      individually, sparing the in-flight renders
//   3. pages refuse to close despite health -> kill browser after all

import puppeteer from 'puppeteer'
import {isTemporarilyBlocked} from './requestBlocker.mjs'
import {
    HOSTRULE_HEADER,
    TRACK_IP_HEADER,
    TRACK_IS_BOT_HEADER,
    TRACK_REFERER_HEADER,
    TRACK_USER_AGENT_HEADER, WEB_PARSER_HEADER
} from '../../api/constants/index.mjs'

// keep in sync with the render semaphore in server.mjs
const RENDER_MAX_CONCURRENT = parseInt(process.env.LUNUC_SSR_CONCURRENCY) || 5

// Threshold for the leak cleanup, NOT a hard capacity limit: above this
// page count the excess (oldest) pages are closed individually while the
// newest RENDER_MAX_CONCURRENT are left alone. Sized as 2x concurrency
// (active renders + closing stragglers) + blank tab + slack. Hard ceiling
// is RAM: every open page holds a ~50-150MB renderer process, so on the
// vps this should stay well below ~15.
const MAX_PAGES_IN_PUPPETEER = RENDER_MAX_CONCURRENT * 2 + 4

const PAGE_STUCK_TIMEOUT_MS = 20000
const CDP_HEALTH_TIMEOUT_MS = 5000
const MAX_CONSECUTIVE_FAILURES = 3

let parseWebsiteBrowser
let browserLaunchPromise // prevents parallel launches (race condition)
let consecutiveFailures = 0

/* helper: reject if a promise takes too long (hung CDP connection) */
const withTimeout = (promise, ms, label) => {
    let timer
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms)
        })
    ]).finally(() => clearTimeout(timer))
}

/* connected state across puppeteer versions: newer expose the .connected
 * property, older only the isConnected() method */
const isBrowserConnected = (browser) => {
    if (typeof browser.connected === 'boolean') {
        return browser.connected
    }
    if (typeof browser.isConnected === 'function') {
        return browser.isConnected()
    }
    return true // unknown api - assume connected, downstream timeouts catch it
}

const wasBrowserKilled = async (browser) => {
    if (!browser) {
        return true
    }
    // a browser can lose its CDP connection while the process is still
    // alive - without this check getBrowser would happily return it and
    // the next pages() call would run into its timeout the hard way
    if (!isBrowserConnected(browser)) {
        return true
    }
    if (!browser.process) {
        return false
    }
    const procInfo = await browser.process()
    return !!procInfo.signalCode // null if browser is still running
}

/* hard kill: graceful close first, SIGKILL as last resort */
const killBrowser = async () => {
    const browser = parseWebsiteBrowser
    // immediately mark as dead so the next request launches a fresh instance
    // even if the kill procedure below hangs
    parseWebsiteBrowser = null
    browserLaunchPromise = null

    if (!browser) {
        return
    }

    const proc = browser.process()

    try {
        // graceful close, but don't wait forever - a hung browser won't respond
        await withTimeout(browser.close(), 3000, 'browser.close')
        console.log('browser closed gracefully')
    } catch (e) {
        console.warn('graceful close failed -> SIGKILL', e.message)
        try {
            // SIGKILL cannot be ignored by the process, unlike SIGINT/SIGTERM
            proc?.kill('SIGKILL')
        } catch (killErr) {
            console.warn('SIGKILL failed', killErr)
        }
    }
}

/* health check: is the CDP connection still responsive? */
const isBrowserHealthy = async () => {
    if (!parseWebsiteBrowser || !isBrowserConnected(parseWebsiteBrowser)) {
        return false
    }
    try {
        // version() is a cheap CDP roundtrip - if this hangs, the browser is stuck
        await withTimeout(parseWebsiteBrowser.version(), CDP_HEALTH_TIMEOUT_MS, 'health check')
        return true
    } catch (e) {
        console.warn('browser health check failed:', e.message)
        return false
    }
}

const getBrowser = async () => {
    if (browserLaunchPromise) {
        // another request is already launching -> wait for it
        return browserLaunchPromise
    }
    if (!(await wasBrowserKilled(parseWebsiteBrowser))) {
        return parseWebsiteBrowser
    }

    console.log('create new browser instance')

    browserLaunchPromise = puppeteer.launch({
        headless: 'new',
        devtools: false,
        protocolTimeout: 60000,
        acceptInsecureCerts: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote', /* fork/exec child processes directly instead of using a zygote process */

            // disable image loading (major bandwidth/memory saver)
            '--blink-settings=imagesEnabled=false',

            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-web-security', // useful for cross-origin crawling, use with caution
            '--disable-features=IsolateOrigins,site-per-process,Translate,BackForwardCache',
            '--disable-popup-blocking',

            // additional perf flags
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--mute-audio',
            '--hide-scrollbars',
            '--metrics-recording-only'
        ]
    }).then(browser => {
        parseWebsiteBrowser = browser
        browserLaunchPromise = null
        return browser
    }).catch(e => {
        browserLaunchPromise = null
        throw e
    })

    return browserLaunchPromise
}

export const parseWebsite = async (urlToFetch, {host, agent, referer, isBot, remoteAddress, cookies}) => {

    // emergency brake ONLY: the render semaphore in index.mjs is the actual
    // concurrency control. These thresholds are deliberately high - if this
    // ever fires, the semaphore has a logic problem and the brake keeps the
    // browser from being buried
    if (isTemporarilyBlocked({requestTimeInMs: 10000, requestPerTime: 100, requestBlockForInMs: 30000, key: 'parseWebsite'})) {
        return {html: '503 Service Unavailable', statusCode: 503}
    }

    let page
    let stuckTimer
    // set by the stuck timer when it abandons and closes the page: the main
    // path must then exit controlled (503) instead of stumbling into
    // "Target closed" errors that would count as browser failures
    let pageAbandonedReason = null

    try {
        const startTime = new Date().getTime()

        console.log(`parseWebsite fetch ${urlToFetch}`)

        const browser = await getBrowser()

        // pages() can hang on a dead browser -> timeout it
        let pages
        try {
            pages = await withTimeout(browser.pages(), CDP_HEALTH_TIMEOUT_MS, 'browser.pages')
        } catch (e) {
            console.warn('browser unresponsive -> kill and retry on next request')
            await killBrowser()
            return {html: 'browser restarting', statusCode: 503}
        }

        if (pages.length > MAX_PAGES_IN_PUPPETEER) {
            // Too many open pages = leak symptom. Diagnose before acting:
            // an UNHEALTHY browser (hung CDP) is the cause, not the victim -
            // individual page.close() calls would each just run into their
            // timeouts, so kill directly. Only a HEALTHY browser gets the
            // targeted cleanup that spares the in-flight renders.
            if (!(await isBrowserHealthy())) {
                console.warn(`${pages.length} open pages and browser unhealthy -> killing browser`)
                await killBrowser()
                return {html: 'browser restarting', statusCode: 503}
            }

            console.warn(`${pages.length} open pages despite semaphore (limit ${MAX_PAGES_IN_PUPPETEER}) -> closing leaked pages`)

            // oldest first (pages() returns creation order; index 0 is the
            // about:blank default tab - skip it). The newest
            // RENDER_MAX_CONCURRENT pages are potentially live renders and
            // are left alone.
            const closeCandidates = pages.slice(1, pages.length - RENDER_MAX_CONCURRENT)
            let closedAny = false
            for (const p of closeCandidates) {
                try {
                    await withTimeout(p.close(), 2000, 'leaked page.close')
                    closedAny = true
                } catch (e) {
                    // ignore - escalation below decides
                }
            }

            if (!closedAny && closeCandidates.length > 0) {
                // healthy per version(), but pages will not close - the
                // health probe was too optimistic, escalate after all
                console.warn('leaked pages could not be closed -> killing browser')
                await killBrowser()
            }
            return {html: 'browser busy, cleaning up', statusCode: 503}
        }

        // newPage() can also hang on a stuck browser
        try {
            page = await withTimeout(browser.newPage(), CDP_HEALTH_TIMEOUT_MS, 'newPage')
        } catch (e) {
            console.warn('newPage hung -> killing browser')
            await killBrowser()
            return {html: 'browser restarting', statusCode: 503}
        }

        // safety net: abandon + close only the stuck page, not the browser.
        // Sets the flag first so the main path exits controlled.
        stuckTimer = setTimeout(async () => {
            pageAbandonedReason = `page still open after ${PAGE_STUCK_TIMEOUT_MS}ms`
            try {
                if (page && !page.isClosed()) {
                    console.warn(`${pageAbandonedReason} -> force close ${urlToFetch}`)
                    await withTimeout(page.close(), 3000, 'stuck page.close').catch(() => {})
                }
            } catch (e) {
                console.warn('error closing stuck page', e)
            }
        }, PAGE_STUCK_TIMEOUT_MS)

        page.setDefaultTimeout(10000)
        page.setDefaultNavigationTimeout(10000)
        await page.setRequestInterception(true)

        // always clear auth cookie.
        await page.setCookie({domain: 'localhost', name: 'auth', value: ''})

        if (cookies && Object.keys(cookies).length > 0 && !isBot) {
            console.log(`Taking over the session can be dangerous. ${urlToFetch}`, Object.keys(cookies))
            const cookiesToSet = Object.keys(cookies).map(k => ({domain: 'localhost', name: k, value: cookies[k]}))
            await page.setCookie(...cookiesToSet)
        }

        await page.setExtraHTTPHeaders({[HOSTRULE_HEADER]: host, [WEB_PARSER_HEADER]: 'true'})

        page.on('request', (request) => {
            // request.frame() can be null (service workers, detached
            // contexts) - a null frame is not an iframe, so let it continue
            // instead of throwing inside the event handler
            const frame = request.frame()
            if (['image', 'stylesheet', 'font', 'manifest', 'media', 'other'].indexOf(request.resourceType()) !== -1 ||
                (frame && frame.url() !== page.mainFrame().url()) /* in iframe */) {
                request.abort('blockedbyclient')
            } else {
                const headers = request.headers()
                headers[TRACK_REFERER_HEADER] = referer || ''
                headers[TRACK_IP_HEADER] = remoteAddress
                headers[TRACK_IS_BOT_HEADER] = isBot
                headers[TRACK_USER_AGENT_HEADER] = agent
                headers[HOSTRULE_HEADER] = host
                request.continue({headers})
            }
        })

        // capture the real status code of the main document
        let statusCode = 200
        let mainResponseSeen = false
        page.on('response', response => {
            if (!mainResponseSeen &&
                response.request().resourceType() === 'document' &&
                response.request().frame() === page.mainFrame()) {
                mainResponseSeen = true
                statusCode = response.status()
            }
            // keep soft-404 detection (client side redirect to /404)
            if (response.status() === 404 && response.request().resourceType() === 'document' && response.url().endsWith('/404')) {
                statusCode = 404
            }
        })

        await page.evaluateOnNewDocument((data) => {
            window._disableWsConnection = true
            window._lunucWebParser = data
            window.addEventListener('appReady', () => {
                if (window._app_) {
                    if (!_app_.JsonDom) {
                        _app_.JsonDom = {}
                    }
                    _app_.JsonDom.elementWatchForceVisible = true
                }
                // signal for waitForFunction below
                window.__LUNUC_APP_READY__ = true
            })
        }, {host, agent, isBot, remoteAddress})

        try {
            // domcontentloaded instead of networkidle2 -> we wait for the app signal instead
            await page.goto(urlToFetch, {waitUntil: 'domcontentloaded'})

            // wait until the app signals readiness; fall back to current DOM on timeout
            await page.waitForFunction('window.__LUNUC_APP_READY__ === true', {timeout: 8000})
                .catch(() => console.warn(`appReady signal not received for ${urlToFetch} -> continue with current DOM`))

            // small settle window for async data rendering after appReady
            await page.waitForNetworkIdle({idleTime: 200, timeout: 3000})
                .catch(() => {})
        } catch (e) {
            console.warn('parseWebsite:', e)
        }

        if (pageAbandonedReason) {
            // the stuck timer already closed this page - controlled exit.
            // This is a slow page, not a browser failure: it must NOT count
            // towards consecutiveFailures / trigger a browser restart
            console.warn(`render abandoned (${pageAbandonedReason}) ${urlToFetch}`)
            clearTimeout(stuckTimer)
            return {html: 'render timeout', statusCode: 503}
        }

        let html = await page.content()
        html = html.replace('</head>', '<script>window.LUNUC_PREPARSED=true</script></head>')

        console.log(`url fetched ${urlToFetch} (statusCode ${statusCode}) in ${new Date().getTime() - startTime}ms`)

        clearTimeout(stuckTimer)
        await withTimeout(page.close(), 3000, 'page.close').catch(() => {})

        consecutiveFailures = 0

        return {html, statusCode}
    } catch (e) {
        clearTimeout(stuckTimer)

        if (pageAbandonedReason) {
            // late race: the stuck timer closed the page while the main path
            // was inside a page call ("Target closed" etc.) - same controlled
            // exit as above, not a browser failure
            console.warn(`render abandoned (${pageAbandonedReason}) ${urlToFetch}`)
            return {html: 'render timeout', statusCode: 503}
        }

        console.warn('parseWebsite error ' + urlToFetch, e)

        consecutiveFailures++
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            // multiple failures in a row -> the browser itself is likely the problem
            console.warn(`${consecutiveFailures} consecutive failures -> restarting browser`)
            consecutiveFailures = 0
            await killBrowser()
        } else if (page && !page.isClosed()) {
            // page.close() on a hung browser can hang too
            await withTimeout(page.close(), 3000, 'page.close').catch(() => {})
        }
        return {html: e.message, statusCode: 500}
    }
}