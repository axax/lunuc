import puppeteerCore from 'puppeteer'
import {addExtra} from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
// full file path: the package has no "exports", so a directory import fails as ES module
import UserAgentOverride from 'puppeteer-extra-plugin-stealth/evasions/user-agent-override/index.js'
import NavigatorLanguages from 'puppeteer-extra-plugin-stealth/evasions/navigator.languages/index.js'
import {createSharedBrowser} from './sharedBrowser.mjs'

/*
 Chrome with a consistent fingerprint, the way a normal visitor's browser looks.
 Used by system/browser-simulator (browser-view) and by the LLM tools browserControl / webRead
 (apis/system/ai/mcp) - so the LLM reaches the same pages as browser-view does.

 Fingerprint must be consistent, otherwise bot checks (e.g. invisible reCAPTCHA v3, Cloudflare)
 reject it. The user agent comes from the stealth plugin (real Chrome version, "Headless" removed,
 Linux masked as Windows, matching Client Hints and navigator.platform).
 Don't call page.setUserAgent(), it resets these values.

 Optional proxy (e.g. a residential connection instead of the datacenter IP of the server):
   env LUNUC_BROWSER_PROXY=http://host:port or socks5://host:port
 */
export const BROWSER_LOCALE = 'de-CH'
export const BROWSER_LANGUAGES = ['de-CH', 'de', 'en']
export const BROWSER_TIMEZONE = 'Europe/Zurich'
export const BROWSER_PROXY = process.env.LUNUC_BROWSER_PROXY

// own puppeteer-extra instance per launch, so changed plugin options apply after a browser reset
export const launchStealthBrowser = (options = {}) => {
    const puppeteer = addExtra(puppeteerCore)
    const stealth = StealthPlugin()
    stealth.enabledEvasions.delete('user-agent-override')
    stealth.enabledEvasions.delete('navigator.languages')
    puppeteer.use(stealth)
    puppeteer.use(UserAgentOverride({locale: BROWSER_LANGUAGES.join(',')}))
    puppeteer.use(NavigatorLanguages({languages: BROWSER_LANGUAGES}))

    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // prevents /dev/shm crashes
        '--disable-blink-features=AutomationControlled',
        `--lang=${BROWSER_LOCALE}`,
        '--window-size=1280,800'
    ]
    if (process.platform === 'linux') {
        // no GPU on the server: keep WebGL with software rendering (no WebGL at all looks like a bot)
        args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader')
    }
    if (BROWSER_PROXY) {
        args.push(`--proxy-server=${BROWSER_PROXY}`)
    }
    return puppeteer.launch({
        headless: true,
        defaultViewport: null,
        protocolTimeout: 30000,
        ignoreDefaultArgs: ['--enable-automation'],
        ...options,
        args: [...args, ...(options.args || [])]
    })
}

// per page settings that belong to the fingerprint (timezone matches the locale)
export const prepareStealthPage = async (page) => {
    try {
        await page.emulateTimezone(BROWSER_TIMEZONE)
    } catch (e) {
        console.log('emulateTimezone failed', e.message)
    }
}

/*
 Bot check pages ("Just a moment..."): Cloudflare marks them with the header cf-mitigated: challenge.
 A plain HTTP request can never pass them (they are a JavaScript test) - a browser has to load the page.
 */
const CHALLENGE_TITLE_RE = /^(just a moment|einen moment|un instant|attention required|please wait|bitte warten)/i

export const isChallengeResponse = (res) => {
    if (!res || !res.headers) return false
    const get = (name) => String((typeof res.headers.get === 'function' ? res.headers.get(name) : res.headers[name]) || '')
    return get('cf-mitigated').toLowerCase() === 'challenge' ||
        ([403, 503].includes(res.status) && /cloudflare/i.test(get('server')))
}

// waits until the page is no longer a bot check page; false if it still is after timeoutMs
export const waitForChallenge = async (page, timeoutMs = 20000) => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
        // title() throws while the challenge navigates to the real page
        const title = await page.title().catch(() => null)
        if (title !== null && !CHALLENGE_TITLE_RE.test(title.trim())) return true
        await new Promise(resolve => setTimeout(resolve, 500))
    }
    return false
}

/*
 One shared stealth Chrome for the LLM tools. Pages open in the default context, so cookies (e.g. the
 cf_clearance of a passed bot check) stay while the Chrome runs - the next call does not start over.
 The tools are admin only (browserControl: admin_options).
 */
export const stealthBrowser = createSharedBrowser({idleCloseMs: 10 * 60 * 1000, launch: launchStealthBrowser})
