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
//
// Render-completeness handling:
//   goto/appReady/networkIdle timeouts used to be swallowed and the page
//   was served anyway with whatever statusCode the response listener
//   captured (usually 200) - meaning an incomplete or empty DOM could get
//   indexed as if it were a valid page. Now: if the appReady signal never
//   fires, the render is considered INCOMPLETE and a 503 is returned
//   instead, regardless of the underlying HTTP status. This also gives
//   in-flight client-side fetches (e.g. the GraphQL cmsPage query) a short
//   extra grace window before the page context is torn down, which
//   reduces spurious "Failed to fetch" errors caused by page.close()
//   aborting requests that were seconds away from completing.

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

// NEW: configurable wait budgets for rendering, tunable via ENV without a
// code change. Defaults match the previous hardcoded values.
const NAV_TIMEOUT_MS = parseInt(process.env.LUNUC_SSR_NAV_TIMEOUT_MS) || 10000
const APP_READY_TIMEOUT_MS = parseInt(process.env.LUNUC_SSR_APPREADY_TIMEOUT_MS) || 8000
const NETWORK_IDLE_TIMEOUT_MS = parseInt(process.env.LUNUC_SSR_NETIDLE_TIMEOUT_MS) || 3000
// NEW: extra grace period before the page is closed, in case requests are
// still pending after appReady. Prevents a GraphQL fetch that's about to
// finish from being hard-aborted by page.close().
const CLOSE_GRACE_TIMEOUT_MS = parseInt(process.env.LUNUC_SSR_CLOSE_GRACE_MS) || 2000

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

    // -----------------------------------------------------------------
    // 1️⃣  Emergency brake – prevents the parser from overwhelming the
    //     browser when the system is under heavy load.
    // -----------------------------------------------------------------
    if (isTemporarilyBlocked({
        requestTimeInMs: 10000,
        requestPerTime: 100,
        requestBlockForInMs: 30000,
        key: 'parseWebsite'
    })) {
        return {html: '503 Service Unavailable', statusCode: 503}
    }

    let page
    let stuckTimer
    let pageAbandonedReason = null
    let pendingRequestCount = 0          // number of in‑flight requests

    try {
        const startTime = Date.now()
        console.log(`parseWebsite fetch ${urlToFetch}`)

        // -------------------------------------------------------------
        // Browser initialization
        // -------------------------------------------------------------
        const browser = await getBrowser()

        // `pages()` may hang on a dead browser – protect with a timeout
        let pages
        try {
            pages = await withTimeout(browser.pages(), CDP_HEALTH_TIMEOUT_MS, 'browser.pages')
        } catch (e) {
            console.warn('browser unresponsive -> kill and retry on next request')
            await killBrowser()
            return {html: 'browser restarting', statusCode: 503}
        }

        // -----------------------------------------------------------------
        // Leak protection: if too many pages are open, clean up or kill
        // -----------------------------------------------------------------
        if (pages.length > MAX_PAGES_IN_PUPPETEER) {
            if (!(await isBrowserHealthy())) {
                console.warn(`${pages.length} open pages and browser unhealthy -> killing browser`)
                await killBrowser()
                return {html: 'browser restarting', statusCode: 503}
            }

            console.warn(`${pages.length} open pages despite semaphore (limit ${MAX_PAGES_IN_PUPPETEER}) -> closing leaked pages`)

            const closeCandidates = pages.slice(1, pages.length - RENDER_MAX_CONCURRENT)
            let closedAny = false
            for (const p of closeCandidates) {
                try {
                    await withTimeout(p.close(), 2000, 'leaked page.close')
                    closedAny = true
                } catch (_) { /* ignore */ }
            }

            if (!closedAny && closeCandidates.length > 0) {
                console.warn('leaked pages could not be closed -> killing browser')
                await killBrowser()
            }
            return {html: 'browser busy, cleaning up', statusCode: 503}
        }

        // -------------------------------------------------------------
        // Open a new page (with timeout)
        // -------------------------------------------------------------
        try {
            page = await withTimeout(browser.newPage(), CDP_HEALTH_TIMEOUT_MS, 'newPage')
        } catch (e) {
            console.warn('newPage hung -> killing browser')
            await killBrowser()
            return {html: 'browser restarting', statusCode: 503}
        }

        // -----------------------------------------------------------------
        // Stuck‑timer – forces a page close after a maximum allowed time
        // -----------------------------------------------------------------
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

        page.setDefaultTimeout(NAV_TIMEOUT_MS)
        page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS)
        await page.setRequestInterception(true)

        // -----------------------------------------------------------------
        // Cookie & header preparation
        // -----------------------------------------------------------------
        await page.setCookie({domain: 'localhost', name: 'auth', value: ''})

        if (cookies && Object.keys(cookies).length > 0 && !isBot) {
            console.log(`Taking over the session can be dangerous. ${urlToFetch}`, Object.keys(cookies))
            const cookiesToSet = Object.keys(cookies).map(k => ({
                domain: 'localhost',
                name: k,
                value: cookies[k]
            }))
            await page.setCookie(...cookiesToSet)
        }

        await page.setExtraHTTPHeaders({
            [HOSTRULE_HEADER]: host,
            [WEB_PARSER_HEADER]: 'true'
        })

        // -----------------------------------------------------------------
        // Request interception – block unnecessary resources and add tracking headers
        // -----------------------------------------------------------------
        page.on('request', request => {
            const frame = request.frame()
            if (
                ['image', 'stylesheet', 'font', 'manifest', 'media', 'other'].includes(request.resourceType()) ||
                (frame && frame.url() !== page.mainFrame().url()) // in iframe
            ) {
                request.abort('blockedbyclient')
            } else {
                pendingRequestCount++
                const hdr = request.headers()
                hdr[TRACK_REFERER_HEADER] = referer || ''
                hdr[TRACK_IP_HEADER] = remoteAddress
                hdr[TRACK_IS_BOT_HEADER] = isBot
                hdr[TRACK_USER_AGENT_HEADER] = agent
                hdr[HOSTRULE_HEADER] = host
                request.continue({headers: hdr})
            }
        })

        // -----------------------------------------------------------------
        // 2️⃣  Response monitoring – capture status code and possible redirect target
        // -----------------------------------------------------------------
        let statusCode = 200
        let mainResponseSeen = false
        let redirectDetected = false
        let redirectUrl = null               // target URL from Location header (if any)

        page.on('response', response => {
            const isMainDoc =
                response.request().resourceType() === 'document' &&
                response.request().frame() === page.mainFrame()

            if (!mainResponseSeen && isMainDoc) {
                mainResponseSeen = true
                statusCode = response.status()

                // ---------------------------------------------------------
                // Detect any 3xx redirect (300‑308). Store flag, code and
                // optional Location header.
                // ---------------------------------------------------------
                if (statusCode >= 300 && statusCode < 400) {
                    redirectDetected = true
                    const loc = response.headers()['location'] || response.headers()['Location']
                    if (loc) redirectUrl = loc
                    console.warn(`Redirect (${statusCode}) detected for ${urlToFetch} – not following`)
                }
            }

            // Soft‑404 detection (client‑side redirect to /404)
            if (
                response.status() === 404 &&
                response.request().resourceType() === 'document' &&
                response.url().endsWith('/404')
            ) {
                statusCode = 404
            }
        })

        // -----------------------------------------------------------------
        // Decrement request counter when a request finishes or fails
        // -----------------------------------------------------------------
        page.on('requestfinished', () => { pendingRequestCount-- })
        page.on('requestfailed', () => { pendingRequestCount-- })

        // -----------------------------------------------------------------
        // Inject script that sets up the app‑ready signal
        // -----------------------------------------------------------------
        await page.evaluateOnNewDocument(
            data => {
                window._disableWsConnection = true
                window._lunucWebParser = data
                window.addEventListener('appReady', () => {
                    if (window._app_) {
                        if (!_app_.JsonDom) _app_.JsonDom = {}
                        _app_.JsonDom.elementWatchForceVisible = true
                    }
                    window.__LUNUC_APP_READY__ = true
                })
            },
            {host, agent, isBot, remoteAddress}
        )

        let appReadyReceived = false

        // -----------------------------------------------------------------
        // 3️⃣  Navigation & optional app‑ready waiting (skipped on redirect)
        // -----------------------------------------------------------------
        try {
            await page.goto(urlToFetch, {waitUntil: 'networkidle2'})

            if (!redirectDetected) {
                // Wait for the SPA to signal readiness; fallback on timeout
                await page
                    .waitForFunction('window.__LUNUC_APP_READY__ === true', {
                        timeout: APP_READY_TIMEOUT_MS
                    })
                    .then(() => { appReadyReceived = true })
                    .catch(() =>
                        console.warn(`appReady signal not received for ${urlToFetch} -> continue with current DOM`)
                    )

                // Small settle window after appReady
                await page.waitForNetworkIdle({idleTime: 200, timeout: NETWORK_IDLE_TIMEOUT_MS}).catch(() => {})

                // Grace period for still‑pending requests after appReady
                if (appReadyReceived && pendingRequestCount > 0) {
                    const graceStart = Date.now()
                    while (pendingRequestCount > 0 && Date.now() - graceStart < CLOSE_GRACE_TIMEOUT_MS) {
                        await new Promise(r => setTimeout(r, 100))
                    }
                    if (pendingRequestCount > 0) {
                        console.warn(`${pendingRequestCount} request(s) still pending after grace window for ${urlToFetch}`)
                    }
                }
            }
        } catch (e) {
            console.warn('parseWebsite:', e)
        }

        // -----------------------------------------------------------------
        // Was the page abandoned by the stuck timer?
        // -----------------------------------------------------------------
        if (pageAbandonedReason) {
            console.warn(`render abandoned (${pageAbandonedReason}) ${urlToFetch}`)
            clearTimeout(stuckTimer)
            return {html: 'render timeout', statusCode: 503}
        }

        // -----------------------------------------------------------------
        // 4️⃣  Redirect case – return immediately, no further processing
        // -----------------------------------------------------------------
        if (redirectDetected) {
            clearTimeout(stuckTimer)
            await withTimeout(page.close(), 3000, 'page.close').catch(() => {})
            consecutiveFailures = 0
            return {
                html: `redirect ${statusCode}`,
                statusCode,
                redirectUrl            // may be null if no Location header was sent
            }
        }

        // -----------------------------------------------------------------
        // No redirect → verify that the app signaled readiness
        // -----------------------------------------------------------------
        if (!appReadyReceived) {
            console.warn(`render incomplete (no appReady) -> 503 ${urlToFetch}`)
            clearTimeout(stuckTimer)
            await withTimeout(page.close(), 3000, 'page.close').catch(() => {})
            consecutiveFailures = 0
            return {html: 'render incomplete', statusCode: 503}
        }

        // -----------------------------------------------------------------
        // Normal success path – capture HTML content
        // -----------------------------------------------------------------
        let html = await page.content()
        html = html.replace('</head>', '<script>window.LUNUC_PREPARSED=true</script></head>')

        console.log(`url fetched ${urlToFetch} (statusCode ${statusCode}) in ${Date.now() - startTime}ms`)

        clearTimeout(stuckTimer)
        await withTimeout(page.close(), 3000, 'page.close').catch(() => {})

        consecutiveFailures = 0
        return {html, statusCode}
    } catch (e) {
        // -----------------------------------------------------------------
        // General error handling (same as original)
        // -----------------------------------------------------------------
        clearTimeout(stuckTimer)

        if (pageAbandonedReason) {
            console.warn(`render abandoned (${pageAbandonedReason}) ${urlToFetch}`)
            return {html: 'render timeout', statusCode: 503}
        }

        console.warn('parseWebsite error ' + urlToFetch, e)

        consecutiveFailures++
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            console.warn(`${consecutiveFailures} consecutive failures -> restarting browser`)
            consecutiveFailures = 0
            await killBrowser()
        } else if (page && !page.isClosed()) {
            await withTimeout(page.close(), 3000, 'page.close').catch(() => {})
        }
        return {html: e.message, statusCode: 500}
    }
}