import puppeteer from 'puppeteer'

/*
 One shared headless Chrome per process for short jobs (screenshots, evaluating pages).
 Starting Chrome costs about 0.5-2s cpu and a few hundred MB per job; with this every job only
 gets its own browser context (separate cookies, storage and cache - like a fresh browser).
 Ignoring certificate errors (acceptInsecureCerts) is set browser wide and applies to all contexts.
 The Chrome is closed after idleCloseMs without jobs and started again when needed.

 launch: own start function instead of puppeteer.launch (e.g. launchStealthBrowser, util/stealthBrowser.mjs).

 Not used for the SSR renderer (server/util/web2html.mjs): that Chrome needs its own flags
 (no images, no web security, lowered priority) and health checks.

 usage:
   const sharedBrowser = createSharedBrowser()
   const browser = await sharedBrowser.acquire(launchOptions) // launchOptions only used for a new start
   const context = await browser.createBrowserContext()
   try { ... } finally { await context.close(); sharedBrowser.release() }
 */
export const BASE_BROWSER_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']

export const createSharedBrowser = ({idleCloseMs = 5 * 60 * 1000, launch = (options) => puppeteer.launch(options)} = {}) => {
    const state = {browser: null, starting: null, users: 0, idleTimer: null}

    // closes the Chrome now (e.g. after a job timeout, it may be the one that hangs)
    const close = () => {
        const browser = state.browser
        state.browser = null
        if (browser) {
            browser.close().catch(() => {})
        }
    }

    const release = () => {
        state.users = Math.max(0, state.users - 1)
        if (state.users === 0 && state.browser && !state.idleTimer) {
            state.idleTimer = setTimeout(() => {
                state.idleTimer = null
                if (state.users === 0) {
                    close()
                }
            }, idleCloseMs)
            state.idleTimer.unref?.()
        }
    }

    // every successful acquire must be followed by exactly one release
    const acquire = async (launchOptions) => {
        // counted before the await, so the idle timer can't close it in the meantime
        state.users++
        if (state.idleTimer) {
            clearTimeout(state.idleTimer)
            state.idleTimer = null
        }
        if (state.browser && state.browser.connected) {
            return state.browser
        }
        if (!state.starting) {
            state.starting = launch(launchOptions).then(browser => {
                state.browser = browser
                browser.on('disconnected', () => {
                    if (state.browser === browser) {
                        state.browser = null
                    }
                })
                return browser
            }).finally(() => {
                state.starting = null
            })
        }
        try {
            return await state.starting
        } catch (e) {
            release()
            throw e
        }
    }

    return {acquire, release, close}
}
