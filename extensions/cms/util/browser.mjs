import config from '../../../gensrc/config.mjs'
import path from 'path'
import Util from '../../../api/util/index.mjs'
import Cache from '../../../util/cache.mjs'
import {pubsubDelayed} from '../../../api/subscription.mjs'
import puppeteer from 'puppeteer'


const {UPLOAD_DIR, UPLOAD_URL} = config


let websiteProcessingQueue = []
let isQueueProcessing = false


const addToWebsiteQueue = async (processData) => {
    const {cacheKey,segment,resolvedData,dataKey} = processData

    if (cacheKey) {
        const cachedData = Cache.cache[cacheKey] // Cache.get(cacheKey, true)
        if (cachedData) {
            resolvedData[dataKey] = cachedData.data
            if (Cache.isValid(cachedData)) {
                // no need to wait for result
                return false
            }
        }
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


async function startProcessingQueue() {
    if (!isQueueProcessing) {
        isQueueProcessing = true
        while (websiteProcessingQueue.length > 0) {
            await processWebsiteData(websiteProcessingQueue[0])

            websiteProcessingQueue.shift()
        }
        isQueueProcessing = false
    }
}

async function processWebsiteData(processData) {
    const {segment, scope, resolvedData, cacheKey, context, dataKey} = processData


    const data = await openInBrowser(segment.website, scope, resolvedData)
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



const openInBrowser = async (options, scope, resolvedData) => {

    const {url, pipeline, args, images, ignoreSsl, waitUntil, timeout, viewPort, evaluateOnNewDocument} = options
    let data = {}, error


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


    const browserInstance = await puppeteer.launch({
        ignoreHTTPSErrors: true,  /* deprecated */
        acceptInsecureCerts:true,
        args: args || minimal_args /* ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']*/
    })
    const page = await browserInstance.newPage()

    console.log(`Open in headless browser ${url}`)
    try {

        if(viewPort) {
            await page.setViewport(viewPort)
        }

        if (images === false) {
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
                const pipeReplaceStr = tpl.call({scope, data: resolvedData})
                const pipe = JSON.parse(pipeReplaceStr)

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

                    if (Util.ensureDirectoryExistence(upload_dir)) {


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
                    /*} else if (pipe.waitForFunction) {
                        await page.waitFor(pipe.waitForFunction.expr, {timeout: pipe.waitForFunction.timeout || 10000});*/


                    /*const startTime = new Date()
                    const timeout = pipe.waitFor.timeout || 10000
                    let isValid = false
                    while (timeout > (new Date() - startTime)) {
                        const tmpData = await evalFunc(pipe.waitFor.eval)
                        if (tmpData) {
                            isValid = true
                            break
                        }
                        await Util.sleep(50)
                    }
                    if (!isValid) {
                        break
                    }*/

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
    await page.close()
    browserInstance.close()

    return {eval: data, error}
}

export {openInBrowser, addToWebsiteQueue}
