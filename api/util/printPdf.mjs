import {createSharedBrowser, BASE_BROWSER_ARGS} from '../../util/sharedBrowser.mjs'
import {isPublicHttpUrl} from '../../util/networkGuard.mjs'

/*
 Server side pdf for the Print component (prop pdfMode="server").

 The client sends the html of the print area plus the css of the page, Chrome renders it with its
 print engine (page.pdf). Unlike the client side variant (html2canvas -> images) the pdf keeps real
 text, links, vector graphics and fonts, and it is much smaller.

 Security: the html comes from a request, so
  - javascript is disabled in the page
  - every sub request (images, fonts, css) must be a public http(s) url or a data: url (SSRF guard,
    same as the screenshot jobs). LUNUC_PRINTPDF_ALLOW_LOCAL=1 allows private hosts for development.
  - at most PRINTPDF_MAX_CONCURRENT pdfs are rendered at the same time, a bounded queue waits,
    everything above gets 503
  - one browser context per job, closed afterwards
 */

const PRINT_WIDTH_PX = 1020 // same layout width as the client side variant (see Print.js PAGE_WIDTH)
const A4_WIDTH_PX = 793.7 // 210mm @ 96dpi
const PDF_SCALE = A4_WIDTH_PX / PRINT_WIDTH_PX
const MAX_CONCURRENT = parseInt(process.env.LUNUC_PRINTPDF_CONCURRENCY) || 3
const MAX_QUEUE = parseInt(process.env.LUNUC_PRINTPDF_QUEUE) || 10
const JOB_TIMEOUT_MS = 45000
const ALLOW_LOCAL = process.env.LUNUC_PRINTPDF_ALLOW_LOCAL === '1'

const sharedBrowser = createSharedBrowser({idleCloseMs: 2 * 60 * 1000})

let active = 0
const queue = []

const acquireSlot = () => {
    if (active < MAX_CONCURRENT) {
        active++
        return Promise.resolve(true)
    }
    if (queue.length >= MAX_QUEUE) {
        return Promise.resolve(false)
    }
    return new Promise(resolve => queue.push(resolve))
}

const releaseSlot = () => {
    const next = queue.shift()
    if (next) {
        next(true)
    } else {
        active--
    }
}

const escapeAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// a selector is put into a stylesheet: no way out of the rule
const safeSelector = s => typeof s === 'string' && s.trim() && !/[{}<>;\\]/.test(s) ? s.trim() : null

const toSelector = cn => {
    const s = safeSelector(cn)
    if (!s) return null
    return /^[.#]/.test(s) || s.indexOf('[') >= 0 ? s : '.' + s
}

// attributes of <html> / <body> of the page (class, lang, data-theme ...): css may depend on them
const attrString = attrs => {
    if (!attrs || typeof attrs !== 'object') return ''
    return Object.keys(attrs)
        .filter(name => /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(name) && !/^on/i.test(name))
        .filter(name => typeof attrs[name] === 'string' && attrs[name].length < 2000)
        .map(name => ` ${name}="${escapeAttr(attrs[name])}"`).join('')
}

const buildHtml = ({html, css, headerHeight, footerHeight, padding, htmlAttrs, bodyAttrs, baseUrl, watermark, watermarkOption, breakBeforeSelector,
                       keepTogetherSelectors, keepWithNextSelector}) => {
    const rules = []
    const before = safeSelector(breakBeforeSelector)
    if (before) {
        rules.push(`${before}{break-before:page;page-break-before:always}`)
    }
    const together = (keepTogetherSelectors || []).map(toSelector).filter(Boolean)
    together.push('tr', 'img', 'figure') // never cut a table row or an image in half
    rules.push(`${together.join(',')}{break-inside:avoid;page-break-inside:avoid}`)
    const withNext = safeSelector(keepWithNextSelector)
    if (withNext) {
        rules.push(`${withNext}{break-after:avoid;page-break-after:avoid}`)
    }

    let wm = ''
    if (watermark) {
        const bottom = Math.max(0, parseInt(watermarkOption?.bottom) || 0)
        const horizontal = watermarkOption?.left === 'center' ? 'left:50%;transform:translateX(-50%);' : 'right:0;'
        // position: fixed is repeated on every page by Chrome
        wm = `<img src="${escapeAttr(watermark)}" style="position:fixed;bottom:${bottom}px;${horizontal}z-index:1000">`
    }

    // Header and footer stay where they are in the html (so every css rule that is scoped to a
    // parent still matches); the client marked them with data-print-fixed. position: fixed is
    // repeated on every page by Chrome. The content gets a padding of the same height on every
    // page (box-decoration-break: clone repeats the padding of a fragmented box).
    const {top: pt, right: pr, bottom: pb, left: pl} = padding
    const content = `<div class="__print_flow" style="padding:${pt + headerHeight}px 0 ${pb + footerHeight}px 0">${html}</div>`

    return `<!DOCTYPE html><html${attrString(htmlAttrs)}><head><meta charset="utf-8"><base href="${escapeAttr(baseUrl)}">
<style>${css}</style>
<style>
html,body{margin:0;padding:0;background:#fff}
.__print_flow{box-decoration-break:clone;-webkit-box-decoration-break:clone}
.print-area{height:auto!important;overflow:visible!important;width:100%!important;box-sizing:border-box;box-shadow:none!important;border:none!important;padding-top:0!important;padding-bottom:0!important}
[data-print-fixed="header"]{position:fixed!important;top:${pt}px;left:${pl}px;right:${pr}px;width:auto!important;z-index:1000}
[data-print-fixed="footer"]{position:fixed!important;bottom:${pb}px;left:${pl}px;right:${pr}px;width:auto!important;z-index:1000}
[data-print-fixed="hidden"]{display:none!important}
${rules.join('\n')}
</style></head><body${attrString(bodyAttrs)}>${content}${wm}</body></html>`
}

const clampHeight = h => Math.min(400, Math.max(1, Math.ceil(Number(h)) || 1))

const validate = (body) => {
    if (!body || typeof body !== 'object') return 'invalid body'
    if (typeof body.html !== 'string' || !body.html) return 'html missing'
    if (typeof body.css !== 'string') return 'css missing'
    // heights of the repeated header / footer (0 = none) and the padding of the print area, in px
    body.headerHeight = body.headerHeight ? clampHeight(body.headerHeight) : 0
    body.footerHeight = body.footerHeight ? clampHeight(body.footerHeight) : 0
    const pad = body.padding || {}
    body.padding = {}
    ;['top', 'right', 'bottom', 'left'].forEach(side => {
        body.padding[side] = Math.min(400, Math.max(0, Math.round(Number(pad[side])) || 0))
    })
    try {
        const u = new URL(body.baseUrl)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'invalid baseUrl'
    } catch (e) {
        return 'invalid baseUrl'
    }
    return null
}

export const renderPrintPdf = async (body) => {
    const error = validate(body)
    if (error) {
        return {statusCode: 400, error}
    }
    const gotSlot = await acquireSlot()
    if (!gotSlot) {
        return {statusCode: 503, error: 'Too many pdf requests. Please try again later.'}
    }

    let browser, context, timer
    try {
        browser = await sharedBrowser.acquire({acceptInsecureCerts: true, args: BASE_BROWSER_ARGS})
        context = await browser.createBrowserContext()
        const job = (async () => {
            const page = await context.newPage()
            await page.setJavaScriptEnabled(false)
            await page.setViewport({width: PRINT_WIDTH_PX, height: 1443})
            await page.emulateMediaType('screen')
            await page.setRequestInterception(true)
            page.on('request', async request => {
                try {
                    const url = request.url()
                    if (url.startsWith('data:') || url === 'about:blank') {
                        return request.continue()
                    }
                    if (ALLOW_LOCAL ? /^https?:/i.test(url) : await isPublicHttpUrl(url)) {
                        return request.continue()
                    }
                    await request.abort('blockedbyclient')
                } catch (e) {
                    // request already handled / page closed
                }
            })

            await page.setContent(buildHtml(body), {waitUntil: 'networkidle0', timeout: 25000})

            const pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                // the layout is PRINT_WIDTH_PX wide, scaled to the A4 width
                scale: PDF_SCALE,
                margin: {top: 0, right: 0, bottom: 0, left: 0},
                timeout: 30000
            })
            return Buffer.from(pdf)
        })()

        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('pdf timeout')), JOB_TIMEOUT_MS)
        })
        const buffer = await Promise.race([job, timeout])
        return {statusCode: 200, buffer}
    } catch (e) {
        console.error('printPdf failed', e)
        if (e.message === 'pdf timeout') {
            // the Chrome may be the one that hangs
            sharedBrowser.close()
        }
        return {statusCode: 500, error: 'The PDF could not be created.'}
    } finally {
        clearTimeout(timer)
        if (context) {
            context.close().catch(() => {})
        }
        if (browser) {
            sharedBrowser.release()
        }
        releaseSlot()
    }
}

// express handler: POST /graphql/printpdf
export const handlePrintPdf = () => async (req, res) => {
    if (req.method.toLowerCase() !== 'post') {
        res.writeHead(405, {'content-type': 'application/json'})
        res.end(JSON.stringify({status: 'error', message: 'Method Not Allowed. You must send data with post method'}))
        return
    }
    const result = await renderPrintPdf(req.body)
    if (result.statusCode !== 200) {
        res.writeHead(result.statusCode, {'content-type': 'application/json'})
        res.end(JSON.stringify({status: 'error', message: result.error}))
        return
    }
    res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': result.buffer.length,
        'cache-control': 'no-store'
    })
    res.end(result.buffer)
}
