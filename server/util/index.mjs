import puppeteer from 'puppeteer'
import ApiUtil from '../../api/util/index.mjs'
import {isTemporarilyBlocked} from './requestBlocker.mjs'

// Same private-network check as server/index.mjs's isPrivateNetworkTarget.
// Duplicated intentionally: this module must stay defensive on its own,
// even if the caller's check is ever skipped, weakened, or bypassed via a
// redirect after the caller's check already ran.
const isPrivateNetworkHost = (hostname) => {
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
        return true
    }
    return hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('100.') || // CGNAT / tailscale range
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
}

// Reasonable upper bound for viewport/clip dimensions coming from
// user-supplied options - without this an attacker could request an
// enormous viewport and make Puppeteer try to allocate a huge buffer
// (resource exhaustion / DoS).
const MAX_DIMENSION = 4000
const clampDimension = (value, fallback) => {
    const n = parseInt(value, 10)
    if (!Number.isFinite(n) || n <= 0) {
        return fallback
    }
    return Math.min(n, MAX_DIMENSION)
}

export const doScreenCapture = async (url, filename, options, cookies) => {

    if(isTemporarilyBlocked({requestTimeInMs: 2000, requestPerTime: 6,requestBlockForInMs:30000, key:'doScreenCapture'})){
        return {location: `/lunucapi/system/genimage?width=${options.width || 600}&height=${options.height || 600}&text=Server%20busy.%20Please%20try%20again%20later&statusCode=503`, statusCode: 302}
    }

    console.log(`take screenshot ${url}`)

    // Determine whether this is our own internal self-render (the caller in
    // server/index.mjs resolves relative paths to http://127.0.0.1:PORT/...)
    // or a request against an external, user-supplied url. This distinction
    // drives two separate protections below: cookies must NEVER be attached
    // to an external target, and external targets must be defended against
    // SSRF via redirect even after the caller already validated the initial
    // url.
    let initialHostname
    try {
        initialHostname = new URL(url).hostname
    } catch (e) {
        return {statusCode: 400}
    }
    const isSelfRenderCall = isPrivateNetworkHost(initialHostname)

    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true, /* deprecated */
        acceptInsecureCerts:true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    })
    const page = await browser.newPage()

    // Only forward the requesting user's session cookies for our OWN
    // internal render calls (e.g. rendering an auth-gated page for SSR).
    // Never forward them to an external, user-supplied target - doing so
    // previously allowed an attacker to have a victim's session cookie
    // sent straight to an attacker-controlled server, by pointing the
    // screenshot feature at a domain the attacker owns.
    if (cookies && Object.keys(cookies).length > 0 && isSelfRenderCall) {
        console.log(`doScreenCapture: Taking over the session can be dangerous. ${filename}`, Object.keys(cookies))

        const parsedUrl = new URL(url)
        const domain = parsedUrl.hostname

        const cookiesToSet = Object.keys(cookies).map(k => ({
            domain,
            name: k,
            value: cookies[k],
            path: '/',
            httpOnly: false,
            secure: parsedUrl.protocol === 'https:',
        }))

        await page.setCookie(...cookiesToSet)
    } else if (cookies && Object.keys(cookies).length > 0 && !isSelfRenderCall) {
        console.warn(`doScreenCapture: refusing to forward session cookies to external target ${url}`)
    }

    // For external targets, defend against SSRF via redirect: the caller
    // already validated the INITIAL url, but page.goto() follows redirects
    // automatically, and a redirect chain could still point at an internal
    // address. Intercept every request (including redirects and
    // subresources) and abort anything that resolves to a private network
    // host. Not needed for our own self-render calls, which are internal
    // by design.
    if (!isSelfRenderCall) {
        await page.setRequestInterception(true)
        page.on('request', (req) => {
            let reqHostname
            try {
                reqHostname = new URL(req.url()).hostname
            } catch (e) {
                req.abort()
                return
            }
            if (isPrivateNetworkHost(reqHostname)) {
                console.warn(`doScreenCapture: blocking request to internal host during external capture: ${req.url()}`)
                req.abort()
                return
            }
            req.continue()
        })
    }

    try {
        await page.goto(url, {waitUntil: 'domcontentloaded'})

        const viewportWidth = clampDimension(options.width, 1280)
        const viewportHeight = clampDimension(options.height, 800)
        await page.setViewport({width: viewportWidth, height: viewportHeight})

        if (options.delay) {
            await ApiUtil.sleep(options.delay)
        }
        if (options.padding) {
            let t, l, b, r
            if (options.padding.constructor === String) {
                const parts = options.padding.trim().split(' ')
                if (parts.length === 4) {
                    t = parseInt(parts[0])
                    r = parseInt(parts[1])
                    b = parseInt(parts[2])
                    l = parseInt(parts[3])
                } else {
                    t = r = b = l = parseInt(options.padding)
                }
            } else {
                t = r = b = l = options.padding
            }


            options.clip = {
                x: l,
                y: t,
                width: viewportWidth - (l + r),
                height: viewportHeight - (t + b)
            }
        }

        // Strip "path" (and "type", which also affects how the file is
        // written) from user-supplied options BEFORE spreading, and set
        // "path" last so it can never be overridden. Previously
        // "...options" was spread AFTER "path: filename", meaning an
        // attacker-supplied options.path completely overrode the intended
        // output location - an arbitrary file write anywhere Node could
        // write, with attacker-controlled screenshot bytes as content.
        const {path: _ignoredPath, ...safeScreenshotOptions} = options || {}

        await page.screenshot({
            fullPage: false,
            ...safeScreenshotOptions,
            path: filename
        })
        await page.close()
    }catch (e){
        console.warn(`doScreenCapture: capture failed for ${url}`, e.message)
    }
    await browser.close()
    return {statusCode:200}
}


export const isMimeTypeStreamable = (mimeType) => {
    return mimeType && (mimeType.indexOf('video/') === 0 || mimeType.indexOf('audio/') === 0)
}

export const extendHeaderWithRange = (headerExtra, req, stat)=>{

    headerExtra['Accept-Ranges'] = 'bytes'

    const range = req.headers.range

    if (range) {
        //delete headerExtra['Cache-Control']
        const parts = range.replace(/bytes=/, '').split('-'),
            partialstart = parts[0],
            partialend = parts[1],
            start = parseInt(partialstart, 10),
            end = partialend ? parseInt(partialend, 10) : stat.size - 1,
            chunksize = (end - start) + 1

        headerExtra['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size
        headerExtra['Content-Length'] = chunksize
        return {start, end}
    }
}


export const decodeURIComponentSafe = (string) => {
    if (!string) {
        return string
    }
    return decodeURIComponent(string.replace(/%(?![0-9][0-9a-fA-F]+)/g, '%25'))
}


export const regexRedirectUrl = (url, redirectMap) => {
    for (const [pattern, redirectTemplate] of Object.entries(redirectMap)) {
        // Escape special regex characters in pattern, except for capturing groups
        //const escapedPattern = pattern
        //    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
        //    .replace(/\*/g, '.*?') // Convert * to non-greedy match

        // Create regex from pattern, preserving capturing groups
        const regex = new RegExp(`^${pattern}$`)

        // Test if URL matches pattern
        const match = url.match(regex)

        if (match) {
            // Replace {1}, {2}, etc. with captured groups
            let newUrl = redirectTemplate.constructor === Object ? redirectTemplate.url : redirectTemplate
            match.slice(1).forEach((group, index) => {
                newUrl = newUrl.replace(`{${index + 1}}`, group || '')
            })
            return {url:newUrl, statusCode:redirectTemplate.constructor === Object ? redirectTemplate.statusCode : null}
        }
    }
    return {} // No match found
}


// Parameters that never influence page content - always stripped from
// both the ssr cache key and the url that gets rendered. Without this,
// every utm/gclid variant was a cache miss and its own Puppeteer render.
const TRACKING_PARAMS = new Set([
    '__ssr', '__ssrt', // legacy noscript params - stripped until old links/caches rotate out
    'gclid', 'gclsrc', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid',
    'dclid', 'twclid', 'igshid', 'mc_cid', 'mc_eid', '_ga', '_gl',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'pk_campaign', 'pk_kwd', 'piwik_campaign', 'ref', 'referrer'
])

/**
 * Canonical query for SSR: strips tracking params, applies the optional
 * hostrule whitelist (ssrQueryWhitelist: ['q','page','sort',...]), sorts
 * the rest. Handles repeated params (arrays from url.parse) and valueless
 * params (?flag -> flag=). Returns null when the query exceeds sane
 * limits - the caller treats that as "not renderable" and serves the
 * js shell instead (protects against combinatorial cache/render abuse).
 */
export const createCanonicalSsrQuery = (query, hostrule) => {
    const whitelist = hostrule.ssrQueryWhitelist
    const params = []

    for (const [key, value] of Object.entries(query)) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
            continue
        }
        if (whitelist && !whitelist.includes(key)) {
            continue
        }
        // repeated params arrive as arrays from url.parse
        const values = Array.isArray(value) ? value : [value]
        for (const v of values) {
            params.push([key, v === undefined || v === null ? '' : String(v)])
        }
    }

    // hard limits against combinatorial abuse
    if (params.length > 20) {
        return null
    }

    params.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

    if (qs.length > 512) {
        return null
    }
    return qs ? '?' + qs : ''
}