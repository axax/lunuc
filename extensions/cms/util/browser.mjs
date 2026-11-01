import config from '../../../gensrc/config.mjs'
import path from 'path'
import Util from '../../../api/util/index.mjs'
import Cache from '../../../util/cache.mjs'
import {pubsubDelayed} from '../../../api/subscription.mjs'
import puppeteer from 'puppeteer'
import {isPublicHttpUrl} from '../../../util/networkGuard.mjs'
import {findSegmentStructureChange} from './dataResolverCore.mjs'

// jobs with an url from the request (e.g. ?url= of the screenshot page) - each one starts a
// browser for up to the page timeout, so only a few may wait
const MAX_QUEUED_REQUEST_JOBS = 10


const {UPLOAD_DIR, UPLOAD_URL} = config


let websiteProcessingQueue = []
let isQueueProcessing = false


const addToWebsiteQueue = async (processData) => {
    const {cacheKey,segment,resolvedData,dataKey} = processData

    if (cacheKey) {
        const cachedData = Cache.peek(cacheKey) // also returns expired entries (stale-while-revalidate)
        if (cachedData) {
            resolvedData[dataKey] = cachedData.data
            if (Cache.isValid(cachedData)) {
                // no need to wait for result
                return false
            }
        }
    }

    if (segment.website?._restrictNetwork &&
        websiteProcessingQueue.filter(job => job.segment.website?._restrictNetwork).length >= MAX_QUEUED_REQUEST_JOBS) {
        resolvedData[dataKey] = {error: 'Too many requests. Please try again later.', meta: segment.meta}
        return false
    }

    if (!resolvedData[dataKey]) {
        resolvedData[dataKey] = {}
    }
    resolvedData[dataKey].meta = segment.meta

    if (segment.queue === false) {
        processWebsiteData(processData)
    }else {
        websiteProcessingQueue.push(processData)
        startProcessingQueue()
    }
    return true
}


/*
 One shared headless Chrome for all jobs without own launch args. Starting Chrome costs about
 0.5-2s cpu and a few hundred MB per job; now every job only gets its own browser context
 (separate cookies, storage and cache - like a fresh browser) in the running Chrome.
 Ignoring certificate errors (acceptInsecureCerts) is set browser wide and applies to all contexts.
 The Chrome is closed after BROWSER_IDLE_CLOSE_MS without jobs and started again when needed.
 */
const BROWSER_IDLE_CLOSE_MS = 5 * 60 * 1000
const shared = {browser: null, starting: null, users: 0, idleTimer: null}

const closeSharedBrowser = () => {
    const browser = shared.browser
    shared.browser = null
    if (browser) {
        browser.close().catch(() => {})
    }
}

const acquireSharedBrowser = async (launchOptions) => {
    // counted before the await, so the idle timer can't close it in the meantime
    shared.users++
    if (shared.idleTimer) {
        clearTimeout(shared.idleTimer)
        shared.idleTimer = null
    }
    if (shared.browser && shared.browser.connected) {
        return shared.browser
    }
    if (!shared.starting) {
        shared.starting = puppeteer.launch(launchOptions).then(browser => {
            shared.browser = browser
            browser.on('disconnected', () => {
                if (shared.browser === browser) {
                    shared.browser = null
                }
            })
            return browser
        }).finally(() => {
            shared.starting = null
        })
    }
    try {
        return await shared.starting
    } catch (e) {
        releaseSharedBrowser()
        throw e
    }
}

const releaseSharedBrowser = () => {
    shared.users = Math.max(0, shared.users - 1)
    if (shared.users === 0 && shared.browser && !shared.idleTimer) {
        shared.idleTimer = setTimeout(() => {
            shared.idleTimer = null
            if (shared.users === 0) {
                closeSharedBrowser()
            }
        }, BROWSER_IDLE_CLOSE_MS)
        shared.idleTimer.unref?.()
    }
}

// A job may take at most its page timeout plus this (screenshot, pipeline, closing the browser).
// Before, a job that never finished (or failed while starting the browser) blocked the queue
// for good and the page kept waiting for a result.
const JOB_EXTRA_TIME_MS = 30000
const DEFAULT_PAGE_TIMEOUT_MS = 30000

async function startProcessingQueue() {
    if (!isQueueProcessing) {
        isQueueProcessing = true
        try {
            while (websiteProcessingQueue.length > 0) {
                try {
                    await processWebsiteData(websiteProcessingQueue[0])
                } catch (e) {
                    console.error('website queue: job failed', e)
                }
                websiteProcessingQueue.shift()
            }
        } finally {
            isQueueProcessing = false
        }
    }
}

async function processWebsiteData(processData) {
    const {segment, scope, resolvedData, cacheKey, context, dataKey} = processData

    const maxTime = (segment.website.timeout || DEFAULT_PAGE_TIMEOUT_MS) + JOB_EXTRA_TIME_MS
    // filled by openInBrowser, so a job that runs too long can be stopped
    const running = {}
    let timer
    let data
    try {
        data = await Promise.race([
            openInBrowser(segment.website, scope, resolvedData, running),
            new Promise(resolve => {
                timer = setTimeout(() => {
                    console.warn(`headless browser: job for ${segment.website.url} stopped after ${maxTime}ms`)
                    if (running.close) {
                        running.close()
                    }
                    resolve({eval: {}, error: 'Timeout: the page took too long'})
                }, maxTime)
            })
        ])
    } catch (e) {
        data = {eval: {}, error: e.message}
    } finally {
        clearTimeout(timer)
    }
    if (segment.meta) {
        data.meta = segment.meta
    }
    if (cacheKey && !data.error) {
        Cache.set(cacheKey, data, segment.cache.expiresIn)
    }
    pubsubDelayed.publish('cmsPageData', {
        userId: context.id,
        session: context.session,
        clientId: context.clientId,
        cmsPageData: {resolvedData: JSON.stringify({[dataKey]: data})}
    }, context)
}



const openInBrowser = async (options, scope, resolvedData, running = {}) => {

    const {url, pipeline, args, images, ignoreSsl, waitUntil, timeout, viewPort, evaluateOnNewDocument, _restrictNetwork} = options
    let data = {}, error

    // url from the request: only public http(s), checked before a browser is started
    if (_restrictNetwork && !await isPublicHttpUrl(url)) {
        return {eval: data, error: 'URL not allowed'}
    }


    const minimal_args = [
        '--autoplay-policy=user-gesture-required',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-domain-reliability',
        '--disable-extensions',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-offer-store-unmasked-wallet-cards',
        '--disable-popup-blocking',
        '--disable-print-preview',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-setuid-sandbox',
        '--disable-speech-api',
        '--disable-sync',
        '--hide-scrollbars',
        '--ignore-gpu-blacklist',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-pings',
        '--no-sandbox',
        '--no-zygote',
        '--password-store=basic',
        '--use-gl=swiftshader',
        '--use-mock-keychain',
    ]


    const launchOptions = {
        ignoreHTTPSErrors: true,  /* deprecated */
        acceptInsecureCerts:true,
        args: args || minimal_args /* ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']*/
    }
    // own launch args -> own Chrome as before, otherwise a context in the shared Chrome
    const useShared = !args
    let browserInstance, browserContext, page
    try {
        if (useShared) {
            browserInstance = await acquireSharedBrowser(launchOptions)
            browserContext = await browserInstance.createBrowserContext()
            // job timeout: also restart the shared Chrome, it may be the one that hangs
            running.close = () => {
                browserContext.close().catch(() => {})
                closeSharedBrowser()
            }
            page = await browserContext.newPage()
        } else {
            browserInstance = await puppeteer.launch(launchOptions)
            running.close = () => browserInstance.close().catch(() => {})
            page = await browserInstance.newPage()
        }
    } catch (e) {
        console.error('headless browser: could not start', e)
        if (browserContext) {
            browserContext.close().catch(() => {})
        }
        if (useShared) {
            if (browserInstance) releaseSharedBrowser()
        } else if (browserInstance) {
            browserInstance.close().catch(() => {})
        }
        return {eval: data, error: 'Browser could not be started: ' + e.message}
    }

    console.log(`Open in headless browser ${url}`)
    try {

        if(viewPort) {
            await page.setViewport(viewPort)
        }

        if (_restrictNetwork) {
            // every request of the page (redirects, sub resources, fetch) is checked as well -
            // the host decision is cached, so this is one dns lookup per host
            await page.setRequestInterception(true)
            page.on('request', async request => {
                try {
                    const requestUrl = request.url()
                    if (images === false && request.resourceType() === 'image') {
                        request.abort()
                    } else if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:') || await isPublicHttpUrl(requestUrl)) {
                        request.continue()
                    } else {
                        console.warn(`headless browser: blocked request to ${requestUrl}`)
                        request.abort()
                    }
                } catch (e) {
                    // already handled (e.g. page closed)
                }
            })
        } else if (images === false) {
            await page.setRequestInterception(true)
            page.on('request', request => {
                if (request.resourceType() === 'image')
                    request.abort()
                else
                    request.continue()
            })
        }

        //page.on('console', msg => console.log('PAGE LOG:', msg.text()))

        page.on('error', err => {
            console.log('error happen at the page: ', err)
        })

        page.on('pageerror', pageerr => {
            console.log('pageerror occurred: ', pageerr)
        })

        const gotoOptions = {waitUntil, timeout}

        if(evaluateOnNewDocument){
            await page.evaluateOnNewDocument(evaluateOnNewDocument => {
                eval(evaluateOnNewDocument)
            }, evaluateOnNewDocument)
        }

        await page.goto(url, gotoOptions)

        if (pipeline) {

            const evalFunc = (evalData) => {
                let evalStr
                if (evalData.constructor === Array) {
                    evalStr = evalData.join('\n')
                } else {
                    evalStr = evalData
                }
                return page.evaluate(function (evalStr) {
                    const tpl = new Function(evalStr)
                    return tpl.call({})
                }, evalStr)

            }

            for (const pipeObj of pipeline) {

                const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope;const {data} = this; return `' + JSON.stringify(pipeObj) + '`;')
                // "###${...}###" inserts a raw value (number, boolean) - same as in templateSegment
                const pipeReplaceStr = tpl.call({scope, data: resolvedData}).replace(/"###/g, '').replace(/###"/g, '')
                const pipe = JSON.parse(pipeReplaceStr)

                // same protection as for the segment (see templateSegment): inserted values must
                // not add or override keys (e.g. an "eval" step)
                const change = findSegmentStructureChange(pipeObj, pipe)
                if (change) {
                    console.warn(`headless browser: pipeline structure changed by inserted values at ${change}`)
                    error = 'Invalid parameters in pipeline'
                    break
                }

                const extractData = async (selectors, all) => {
                    if (selectors !== Array) {
                        selectors = [selectors]
                    }

                    for (const get of selectors) {
                        for (const key of Object.keys(get)) {

                            const value = get[key]
                            let attrs, selector

                            if (value.constructor === Object) {
                                attrs = value.attrs
                                selector = value.selector
                            } else {
                                attrs = value
                                selector = key
                            }
                            if (attrs.constructor !== Array) {
                                attrs = [attrs]
                            }
                            if (all) {
                                const els = await page.$$(selector)

                                let arr = []
                                for (const el of els) {
                                    const extract = {}
                                    for (const attr of attrs) {
                                        extract[attr] = await page.evaluate((el, attr) => el[attr], el, attr)
                                    }
                                    arr.push(extract)
                                }
                                data[key] = arr
                            } else {
                                const el = await page.$(selector)
                                const extract = {}
                                for (const attr of attrs) {
                                    extract[attr] = await page.evaluate((el, attr) => el[attr], el, attr)
                                }
                                data[key] = extract
                            }
                        }
                    }
                }


                if (pipe.screenshot) {

                    const upload_dir = path.join(path.resolve(), UPLOAD_DIR) + '/screenshots/'

                    if (Util.ensureDirectoryExistence(upload_dir, true)) {


                        const name = pipe.screenshot.name || (new Date()).getTime() + '.png'

                        await page.screenshot({...pipe.screenshot, path: upload_dir + name});
                        if (!data.screenshot) data.screenshot = []
                        data.screenshot.push({...pipe.screenshot,src: UPLOAD_URL + '/screenshots/' + name})
                    }

                } else if (pipe.extract) {

                    await extractData(pipe.extract)

                } else if (pipe.extractAll) {

                    await extractData(pipe.extractAll, true)


                } else if (pipe.type) {

                    if (pipe.type !== Array) {
                        pipe.type = [pipe.type]
                    }

                    for (const type of pipe.type) {
                        for (const key of Object.keys(type)) {
                            await page.type(key, type[key])
                        }
                    }

                } else if (pipe.submit) {
                    const form = await page.$(pipe.submit)
                    await page.evaluate(form => form.submit(), form)
                    await page.waitForNavigation({waitUntil: 'load'})

                } else if (pipe.click) {
                    const btn = await page.$(pipe.click)
                    if(btn){
                        await page.evaluate(btn => btn.click(), btn)
                    } else {
                        error = `Selector ${pipe.click} for click not exists`
                        break
                    }

                } else if (pipe.waitForNavigation) {
                    await page.waitForNavigation(pipe.waitForNavigation)
                } else if (pipe.waitForSelector) {
                    const keys = Object.keys(pipe.waitForSelector)
                    await page.waitForSelector(keys[0], pipe.waitForSelector[keys[0]])
                } else if (pipe.waitFor) {
                    if (pipe.waitFor.constructor === Object) {
                        await page.waitForSelector(pipe.waitFor.expr, {timeout: pipe.waitFor.timeout || 10000})
                    } else {
                        await page.waitForSelector(pipe.waitFor, {timeout: 10000})
                    }

                } else if (pipe['eval']) {
                    const tmpData = await evalFunc(pipe.eval)
                    if (tmpData) {
                        data = {...data, ...tmpData}
                    }
                } else if (pipe.open) {
                    await page.goto(pipe.open, gotoOptions)
                } else if (pipe.fetch) {

                    let headers = ''

                    if (pipe.fetch.headers) {

                        Object.entries(pipe.fetch.headers).forEach(header => {
                            headers += 'req.setRequestHeader(\'' + header[0] + '\', \'' + header[1] + '\')\n'
                        })
                    }
                    const tmpData = await evalFunc(`const req = new XMLHttpRequest()
                                    req.open('${pipe.fetch.methode || 'post'}', '${pipe.fetch.url}', false)
                                    req.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
                                    ${headers}

                                    req.send('${pipe.fetch.data}')
                                    return req`)

                    if (tmpData) {
                        data = {...data, [pipe.fetch.key || 'fetchResult']: tmpData}
                    }

                }
            }
        }
    } catch (e) {
        console.error(e)
        error = e.message
    }
    // closing must never throw or hang the job (the browser may already be closed by the job timeout)
    await page.close().catch(() => {})
    if (useShared) {
        await browserContext.close().catch(() => {})
        releaseSharedBrowser()
    } else {
        browserInstance.close().catch(() => {})
    }

    return {eval: data, error}
}

export {openInBrowser, addToWebsiteQueue}
