import {launchStealthBrowser, prepareStealthPage} from './stealthBrowser.mjs'

/*
 Shared browser pages ("sessions") of the stealth Chrome.

 Used by
  - system/browser-simulator (browser-view): one page per client (clientId), the user clicks and types in it
  - the LLM tool browserControl (apis/system/ai/mcp): one page per chat, id "llm-<contextKey>"
  - the api proxy-browser-video-stream: MJPEG live view of a page (ctx.subscribeFrames)

 All of them use the same registry and the same Chrome, so the chat page of the LLM can be shown and
 taken over in browser-simulator (prop sessionId) and keeps running when nobody watches.

 Registry: _app_._proxyBrowserPage[id] = ctx
   ctx.page / ctx.context   puppeteer page and its own browser context (own cookies)
   ctx.userId               owner - only this user may watch or control the page
   ctx.time                 last activity (actions, a connected viewer refreshes it every 2s)
   ctx.queue                promise chain: actions of the user and the LLM run one after the other
   ctx.idleMs               the page is closed after this time without activity and without viewer
   ctx.llm                  page of an LLM chat (browserControl)
 Chrome: _app_._proxyBrowser (one per process, launched on demand)
 */

export const LLM_SESSION_PREFIX = 'llm-'
export const DEFAULT_IDLE_MS = 3 * 60 * 1000          // pages of browser-view
export const LLM_SESSION_IDLE_MS = 20 * 60 * 1000     // chat pages: the LLM may wait for the user (login)
export const MAX_LLM_SESSIONS = 4                     // a page costs a few hundred MB
export const LLM_VIEWPORT = {width: 1280, height: 800, deviceScaleFactor: 1}
const PRUNE_INTERVAL_MS = 60 * 1000
const NAVIGATION_TIMEOUT = 30000
const ACTION_TIMEOUT = 10000

const app = () => global._app_ || (global._app_ = {})
export const getRegistry = () => app()._proxyBrowserPage || (app()._proxyBrowserPage = {})

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const isConnected = (browser) => {
    if (!browser) return false
    if (typeof browser.connected === 'boolean') return browser.connected
    return typeof browser.isConnected === 'function' ? browser.isConnected() : false
}

// "llm-<contextKey>" - only characters that are safe in urls and as object key
export const llmSessionId = (contextKey) => {
    const key = String(contextKey || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
    return key ? LLM_SESSION_PREFIX + key : null
}
export const isLlmSessionId = (id) => typeof id === 'string' && /^llm-[A-Za-z0-9_-]{1,80}$/.test(id)

/* ---------- Chrome ---------- */
export const getBrowser = async () => {
    const a = app()
    // idle pages of browser-view are closed by the timer too, not only on the next openUrl
    // (with a remote Chrome with windows, see LUNUC_BROWSER_REMOTE, they stay open on its screen otherwise)
    startPruneTimer()
    const current = a._proxyBrowser
    if (isConnected(current)) {
        return current
    }
    if (!a._proxyBrowserLaunching) {
        // parallel calls (several viewers, the LLM) launch only one browser
        const launching = (async () => {
            if (current) {
                try { await current.close() } catch (e) {}
            }
            // the pages of the old browser are gone
            Object.values(a._proxyBrowserPage || {}).forEach(c => { clearInterval(c.polling); clearInterval(c.cookieTimer) })
            a._proxyBrowserPage = {}
            console.log('Create new browser instance')
            const browser = await launchStealthBrowser()
            a._proxyBrowser = browser
            return browser
        })()
        a._proxyBrowserLaunching = launching
        const clear = () => { delete a._proxyBrowserLaunching }
        launching.then(clear, clear)
    }
    return a._proxyBrowserLaunching
}

/* ---------- live view: CDP screencast ----------
 * Chromium pushes a jpeg frame only when the page changed (no polling with page.screenshot()).
 * The stream api subscribes with ctx.subscribeFrames(listener, quality) and gets the frames as Buffer.
 * The screencast only runs while somebody is subscribed and survives page replacements.
 */
export const startScreencast = async (ctx) => {
    if (ctx.screencast || !ctx.page || ctx.page.isClosed() || !ctx.frameListeners || ctx.frameListeners.size === 0) {
        return
    }
    const page = ctx.page
    const screencast = {}
    ctx.screencast = screencast   // set before the first await -> no double start
    try {
        const client = page.createCDPSession ? await page.createCDPSession() : await page.target().createCDPSession()
        screencast.client = client
        client.on('Page.screencastFrame', async ({data, sessionId}) => {
            if (ctx.screencast === screencast) {
                ctx.lastFrame = Buffer.from(data, 'base64')
                ctx.frameListeners.forEach(listener => {
                    try { listener(ctx.lastFrame) } catch (e) { console.log('frame listener failed', e.message) }
                })
            }
            try {
                await client.send('Page.screencastFrameAck', {sessionId})
            } catch (e) {}
        })
        await client.send('Page.startScreencast', {format: 'jpeg', quality: ctx.screencastQuality || 60, everyNthFrame: 1})
    } catch (e) {
        console.log('startScreencast failed', e.message)
        if (ctx.screencast === screencast) {
            ctx.screencast = undefined
        }
    }
}
export const stopScreencast = async (ctx) => {
    const screencast = ctx.screencast
    ctx.screencast = undefined
    if (screencast && screencast.client) {
        try { await screencast.client.send('Page.stopScreencast') } catch (e) {}
        try { await screencast.client.detach() } catch (e) {}
    }
}
// e.g. after the viewport changed
export const restartScreencast = async (ctx) => {
    if (ctx.screencast) {
        await stopScreencast(ctx)
        await startScreencast(ctx)
    }
}
export const attachFrameApi = (ctx) => {
    if (ctx.subscribeFrames) {
        return
    }
    ctx.frameListeners = new Set()
    ctx.subscribeFrames = (listener, quality) => {
        ctx.frameListeners.add(listener)
        if (quality && !ctx.screencast) {
            ctx.screencastQuality = quality
        }
        if (ctx.lastFrame) {
            listener(ctx.lastFrame)
        }
        startScreencast(ctx)
        return () => {
            ctx.frameListeners.delete(listener)
            if (ctx.frameListeners.size === 0) {
                stopScreencast(ctx)
            }
        }
    }
}

/* ---------- pages ---------- */
export const closePageAndContext = async (ctx) => {
    if (ctx && (ctx.page || ctx.context)) {
        clearInterval(ctx.polling)
        clearInterval(ctx.cookieTimer)
        try {
            if (ctx.page) await ctx.page.close()
        } catch (e) {
            console.log('error closing page', e.message)
        }
        try {
            if (ctx.context) await ctx.context.close()
        } catch (e) {
            console.log('error closing context', e.message)
        }
        ctx.page = ctx.context = ctx.polling = undefined
        ctx.screencast = undefined   // belonged to the closed page
        ctx.lastFrame = undefined
    }
}

// busy pages and pages with a viewer are never closed
export const isPageBusy = (ctx) => !!(ctx.playmode || ctx.pending > 0 || ctx.llmBusy ||
    (ctx.script && ctx.script.running) || (ctx.frameListeners && ctx.frameListeners.size > 0))

export const isPageIdle = (ctx, now = Date.now()) =>
    !isPageBusy(ctx) && now - (ctx.time || 0) > (ctx.idleMs || DEFAULT_IDLE_MS)

// closes idle pages (all kinds; called on openUrl of browser-view and by a timer every PRUNE_INTERVAL_MS)
export const pruneIdlePages = async () => {
    const registry = getRegistry()
    for (const [id, ctx] of Object.entries(registry)) {
        if (isPageIdle(ctx) || (ctx.page && ctx.page.isClosed() && !isPageBusy(ctx))) {
            console.log(`auto close browser page ${id}`)
            await closePageAndContext(ctx)
            if (registry[id] === ctx) delete registry[id]
        }
    }
}
const startPruneTimer = () => {
    const a = app()
    if (a._browserSessionPruneTimer) return
    a._browserSessionPruneTimer = setInterval(() => {
        pruneIdlePages().catch(e => console.log('pruneIdlePages failed', e.message))
    }, PRUNE_INTERVAL_MS)
    if (a._browserSessionPruneTimer.unref) a._browserSessionPruneTimer.unref()
}

// only the owner may use a page (an LLM page is created for exactly one user)
export const assertOwner = (ctx, userId) => {
    if (ctx && ctx.userId && String(ctx.userId) !== String(userId)) {
        throw new Error('This browser session belongs to another user')
    }
}

// the oldest idle LLM pages make room for a new one
const makeRoomForLlmSession = async () => {
    const registry = getRegistry()
    const llm = Object.entries(registry).filter(([, c]) => c.llm && c.page)
    if (llm.length < MAX_LLM_SESSIONS) return
    const candidates = llm.filter(([, c]) => !isPageBusy(c)).sort((a, b) => (a[1].time || 0) - (b[1].time || 0))
    for (const [id, ctx] of candidates.slice(0, llm.length - MAX_LLM_SESSIONS + 1)) {
        console.log(`close browser page ${id} (max ${MAX_LLM_SESSIONS} LLM sessions)`)
        await closePageAndContext(ctx)
        if (registry[id] === ctx) delete registry[id]
    }
}

/*
 Session of a chat. create=false returns null when there is none.
 Throws when the session belongs to another user.
 */
export const getLlmSession = (sessionId, {userId, create = true} = {}) => {
    if (!isLlmSessionId(sessionId)) {
        throw new Error(`Invalid browser session id: ${sessionId}`)
    }
    const registry = getRegistry()
    let ctx = registry[sessionId]
    if (ctx) {
        assertOwner(ctx, userId)
    } else if (create) {
        ctx = registry[sessionId] = {userId: userId ? String(userId) : undefined, time: Date.now()}
    } else {
        return null
    }
    ctx.id = sessionId
    ctx.llm = true
    ctx.idleMs = LLM_SESSION_IDLE_MS
    attachFrameApi(ctx)
    startPruneTimer()
    return ctx
}

// the page of a session - opened when there is none (or the browser was restarted)
export const ensureSessionPage = async (ctx) => {
    if (ctx.page && !ctx.page.isClosed() && isConnected(app()._proxyBrowser)) {
        return ctx.page
    }
    await closePageAndContext(ctx)
    await makeRoomForLlmSession()
    const browser = await getBrowser()
    // a restarted browser cleared the registry -> register again
    getRegistry()[ctx.id] = ctx

    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    page.setDefaultTimeout(ACTION_TIMEOUT)
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT)
    await prepareStealthPage(page)
    await page.setViewport(ctx.viewport || LLM_VIEWPORT)

    // links with target=_blank / window.open: load in the same page, the viewer only shows this one
    context.on('targetcreated', async (target) => {
        try {
            if (target.type() !== 'page') return
            const newPage = await target.page()
            if (!newPage || newPage === page) return
            let url = newPage.url()
            if (!url || url === 'about:blank') {
                // window.open() without url navigates the new page afterwards
                await newPage.waitForNavigation({timeout: 5000}).catch(() => {})
                url = newPage.url()
            }
            if (url && /^https?:/.test(url)) {
                await page.goto(url, {waitUntil: 'domcontentloaded'}).catch(e => console.log('popup goto failed', e.message))
            }
            // close only now: the stealth plugin is still setting up the new page, closing it right away
            // makes its setup fail with an unhandled rejection
            await sleep(500)
            await newPage.close().catch(() => {})
        } catch (e) {}
    })
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
            ctx.time = Date.now()
            delete ctx.refs   // refs of the old document are gone
        }
    })

    Object.assign(ctx, {page, context, time: Date.now(), screencast: undefined, lastFrame: undefined})
    attachFrameApi(ctx)
    // a viewer is connected already -> stream the new page
    startScreencast(ctx)
    return page
}

export const closeSession = async (sessionId) => {
    const registry = getRegistry()
    const ctx = registry[sessionId]
    if (ctx) {
        await closePageAndContext(ctx)
        if (registry[sessionId] === ctx) delete registry[sessionId]
    }
}

/*
 Runs fn in the queue of the page: user input (browser-simulator) and LLM actions never interleave.
 While it runs the page counts as busy (no auto close) and viewers see "LLM is working".
 */
export const runInSession = (ctx, fn, {label} = {}) => {
    const job = (ctx.queue || Promise.resolve()).catch(() => {}).then(async () => {
        ctx.llmBusy = true
        ctx.time = Date.now()
        if (label) ctx.lastAction = {label, time: Date.now()}
        try {
            return await fn()
        } finally {
            ctx.llmBusy = false
            ctx.time = Date.now()
        }
    })
    ctx.queue = job.catch(() => {})
    return job
}

// state for the viewer (browser-simulator in session mode)
export const sessionInfo = async (ctx) => {
    if (!ctx || !ctx.page || ctx.page.isClosed()) {
        return {exists: false}
    }
    const viewport = ctx.page.viewport() || ctx.viewport || LLM_VIEWPORT
    let title = ''
    try { title = await Promise.race([ctx.page.title(), sleep(1000).then(() => '')]) } catch (e) {}
    return {
        exists: true,
        url: ctx.page.url(),
        title,
        width: viewport.width,
        height: viewport.height,
        busy: !!ctx.llmBusy,
        lastAction: ctx.lastAction || null
    }
}

/* ---------- visible pointer ----------
 The LLM has no mouse: so that a viewer can follow what it does, a cursor moves to the element and the
 element gets a short outline before the action. Both are in the page (part of the screencast) and
 ignore the mouse (pointer-events:none).
 */
export const showPointer = async (page, box, {label} = {}) => {
    if (!box) return
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 2)
    await page.evaluate((x, y, box, label) => {
        const root = document.body || document.documentElement
        if (!root) return
        let cursor = document.getElementById('__lunuc_llm_cursor')
        if (!cursor) {
            cursor = document.createElement('div')
            cursor.id = '__lunuc_llm_cursor'
            cursor.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
                'transition:transform .35s ease;will-change:transform;transform:translate(' + (x - 40) + 'px,' + (y - 40) + 'px)'
            cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">' +
                '<path d="M4 2l16 9.5-7 1.6L9.4 20z" fill="#d97757" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
                '<span style="position:absolute;left:20px;top:16px;font:600 11px/1.4 system-ui,sans-serif;background:#d97757;color:#fff;' +
                'padding:1px 6px;border-radius:8px;white-space:nowrap"></span>'
            root.appendChild(cursor)
            cursor.getBoundingClientRect()   // start position applies before the transition
        }
        cursor.querySelector('span').textContent = label || 'LLM'
        cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'

        const outline = document.createElement('div')
        outline.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #d97757;border-radius:4px;' +
            'background:rgba(217,119,87,.12);transition:opacity .4s ease;left:' + (box.x - 3) + 'px;top:' + (box.y - 3) + 'px;' +
            'width:' + (box.width + 6) + 'px;height:' + (box.height + 6) + 'px'
        root.appendChild(outline)
        setTimeout(() => { outline.style.opacity = '0' }, 900)
        setTimeout(() => { outline.remove() }, 1400)
    }, x, y, {x: box.x, y: box.y, width: box.width, height: box.height}, label || '').catch(() => {})
    await sleep(380)   // let the viewer see where it goes
    return {x, y}
}

/* ---------- snapshot: interactive elements with numbers ----------
 Cheaper and more reliable for (local) models than screenshots or CSS selectors: every visible
 interactive element gets a number (attribute data-lunuc-ref), actions use ref instead of a selector.
 */
function collectSnapshot(max) {
    const REF = 'data-lunuc-ref'
    const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],' +
        '[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],' +
        '[contenteditable=""],[contenteditable=true],[onclick]'
    const vh = window.innerHeight, vw = window.innerWidth
    const clean = (s, n = 80) => {
        s = String(s || '').replace(/\s+/g, ' ').trim()
        return s.length > n ? s.slice(0, n - 1) + '…' : s
    }
    const visible = (el) => {
        const r = el.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return null
        const st = getComputedStyle(el)
        if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) return null
        return r
    }
    const nameOf = (el) => {
        const aria = el.getAttribute('aria-label')
        if (aria) return aria
        // ids are looked up in the own tree (document or shadow root)
        const root = el.getRootNode && el.getRootNode().querySelector ? el.getRootNode() : document
        const by = el.getAttribute('aria-labelledby')
        if (by) {
            const t = by.split(/\s+/).map(id => root.querySelector('#' + CSS.escape(id))).filter(Boolean).map(e => e.innerText).join(' ')
            if (t.trim()) return t
        }
        if (el.id) {
            const label = root.querySelector('label[for="' + CSS.escape(el.id) + '"]')
            if (label && label.innerText.trim()) return label.innerText
        }
        const wrap = el.closest('label')
        if (wrap && wrap !== el && wrap.innerText.trim()) return wrap.innerText
        const text = el.tagName === 'SELECT' ? '' : (el.innerText || el.textContent || '')
        if (text.trim()) return text
        return el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') ||
            (el.querySelector('img[alt]') || {}).alt || el.getAttribute('name') || ''
    }
    const roleOf = (el) => {
        const role = el.getAttribute('role')
        if (role) return role
        const tag = el.tagName.toLowerCase()
        if (tag === 'a') return 'link'
        if (tag === 'input') {
            const type = (el.getAttribute('type') || 'text').toLowerCase()
            return ['checkbox', 'radio', 'submit', 'button', 'reset'].includes(type) ? (type === 'submit' || type === 'reset' ? 'button' : type) : 'input:' + type
        }
        if (tag === 'textarea') return 'textarea'
        if (tag === 'select') return 'select'
        if (el.isContentEditable) return 'textbox'
        return tag === 'button' || tag === 'summary' ? 'button' : 'clickable(' + tag + ')'
    }

    // all elements in document order, also inside open shadow roots
    // (cookie banners like Usercentrics live there - a TreeWalker does not enter them)
    const all = []
    const walk = (node) => {
        for (const el of node.children) {
            all.push(el)
            if (el.shadowRoot) walk(el.shadowRoot)
            walk(el)
        }
    }
    walk(document.body || document.documentElement)

    // the element that gets the click at x/y (through shadow roots)
    const topAt = (x, y) => {
        let hit = document.elementFromPoint(x, y)
        while (hit && hit.shadowRoot) {
            const inner = hit.shadowRoot.elementFromPoint(x, y)
            if (!inner || inner === hit) break
            hit = inner
        }
        return hit
    }
    const isInside = (node, el) => {
        for (let n = node; n; n = n.parentNode || n.host) {
            if (n === el) return true
        }
        return false
    }

    // pass 1: headings and interactive elements in document order
    const entries = []
    for (const el of all) {
        el.removeAttribute(REF)
        const tag = el.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE' || el.id === '__lunuc_llm_cursor') continue
        if (/^H[1-3]$/.test(tag)) {
            const r = visible(el)
            const text = r && clean(el.innerText, 100)
            if (text) entries.push({heading: '#'.repeat(+tag[1]) + ' ' + text})
            continue
        }
        if (!el.matches(INTERACTIVE)) continue
        // a clickable wrapper whose only content is another interactive element: the inner one is enough
        if (el.hasAttribute('onclick') && el.querySelector(INTERACTIVE)) continue
        const r = visible(el)
        if (!r) continue
        const offscreen = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw
        let covered = false
        if (!offscreen) {
            // something else (dialog, cookie banner, overlay) gets the click on the center
            const x = Math.min(vw - 1, Math.max(0, (r.left + r.right) / 2))
            const y = Math.min(vh - 1, Math.max(0, (r.top + r.bottom) / 2))
            const hit = topAt(x, y)
            covered = !!hit && !isInside(hit, el) && !isInside(el, hit)
        }
        entries.push({el, r, offscreen, covered})
    }

    // pass 2: the numbers go first to what can be clicked now (visible, not covered), then offscreen, then covered
    const interactive = entries.filter(e => e.el)
    const total = interactive.length
    const prio = (e) => e.covered ? 2 : (e.offscreen ? 1 : 0)
    const chosen = new Set(interactive.map((e, i) => [e, i]).sort((a, b) => prio(a[0]) - prio(b[0]) || a[1] - b[1])
        .slice(0, max).map(([e]) => e))
    const covered = interactive.filter(e => e.covered).length

    const lines = []
    let n = 0
    for (const e of entries) {
        if (e.heading) {
            if (lines.length < max * 1.3) lines.push(e.heading)
            continue
        }
        if (!chosen.has(e)) continue
        const {el, r} = e
        const tag = el.tagName
        n++
        el.setAttribute(REF, String(n))
        const parts = ['[' + n + ']', roleOf(el)]
        const name = clean(nameOf(el))
        if (name) parts.push('"' + name.replace(/"/g, "'") + '"')
        const tagL = tag.toLowerCase()
        if (tagL === 'input' || tagL === 'textarea') {
            const type = (el.getAttribute('type') || '').toLowerCase()
            if (type === 'checkbox' || type === 'radio') {
                parts.push(el.checked ? 'checked' : 'unchecked')
            } else if (el.value) {
                parts.push('value=' + (type === 'password' ? '"•••"' : '"' + clean(el.value, 60) + '"'))
            }
        }
        if (tagL === 'select') {
            const opts = Array.from(el.options).map(o => clean(o.text, 30))
            const sel = el.options[el.selectedIndex]
            parts.push('selected="' + (sel ? clean(sel.text, 40) : '') + '"', 'options=[' + opts.slice(0, 12).join(' | ') + (opts.length > 12 ? ' | …' : '') + ']')
        }
        if (tagL === 'a') {
            const href = el.getAttribute('href') || ''
            if (href && !href.startsWith('javascript:') && href !== '#') parts.push('→ ' + clean(href, 70))
        }
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled')
        if (el.getAttribute('aria-expanded')) parts.push('expanded=' + el.getAttribute('aria-expanded'))
        if (e.offscreen) parts.push('(offscreen)')
        if (e.covered) parts.push('(covered)')
        lines.push(parts.join(' '))
    }
    return {
        title: document.title,
        url: location.href,
        scrollY: Math.round(window.scrollY),
        scrollHeight: Math.round(document.documentElement.scrollHeight),
        viewportHeight: vh,
        iframes: document.querySelectorAll('iframe').length,
        refs: n,
        total,
        covered,
        lines
    }
}

export const takeSnapshot = async (page, {max = 200} = {}) => {
    const s = await page.evaluate(collectSnapshot, max)
    const head = [
        `Page: ${s.title || '(no title)'}`,
        `URL: ${s.url}`,
        `Scroll: ${s.scrollY} of ${Math.max(0, s.scrollHeight - s.viewportHeight)}px` + (s.iframes ? ` · ${s.iframes} iframe(s), their content is not listed` : '')
    ]
    if (s.covered) {
        head.push(`${s.covered} element(s) are covered by something on top (dialog, cookie banner, overlay) - marked (covered). ` +
            'Clicks there hit the element on top: handle the dialog first (its buttons are listed without (covered)).')
    }
    const tail = s.total > s.refs ? [`… ${s.total - s.refs} more interactive elements not numbered (limit ${max}) - scroll or use getText.`] : []
    return {
        text: [...head, '', ...(s.lines.length ? s.lines : ['(no interactive elements found)']), ...tail].join('\n'),
        refs: s.refs
    }
}

// element of a snapshot number (null when the page changed since the snapshot)
export const resolveRef = async (page, ref) => {
    const n = parseInt(ref, 10)
    if (!(n > 0)) return null
    const selector = `[data-lunuc-ref="${n}"]`
    // pierce/: also inside shadow roots (the snapshot numbers elements there too)
    return (await page.$(selector)) || page.$('pierce/' + selector)
}
