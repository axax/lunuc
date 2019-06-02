import puppeteer from 'puppeteer'
import config from 'gen/config'
import path from 'path'
import Util from '../../../api/util'
import Cache from '../../../util/cache'
import {pubsubDelayed} from '../../../api/subscription'


const {UPLOAD_DIR, UPLOAD_URL} = config


let websiteProcessingQueue = []
let isQueueProcessing = false
const processWebsiteQueue = async (job) => {
    websiteProcessingQueue.push(job)

    if (!isQueueProcessing) {
        isQueueProcessing = true
        while (websiteProcessingQueue.length > 0) {
            const {segment, scope, resolvedData, cacheKey, context, dataKey} = websiteProcessingQueue[0]
            const data = await openInBrowser(segment.website, scope, resolvedData)
            if (segment.meta) {
                data.meta = segment.meta
            }
            if (cacheKey) {
                Cache.set(cacheKey, data, segment.cache.expiresIn)
            }
            pubsubDelayed.publish('cmsPageData', {
                userId: context.id,
                session: context.session,
                cmsPageData: {resolvedData: JSON.stringify({[dataKey]: data})}
            }, context)

            websiteProcessingQueue.shift()
        }
        isQueueProcessing = false
    }
}

const openInBrowser = async (options, scope, resolvedData) => {
    const {url, pipeline, images, ignoreSsl, waitUntil, timeout} = options
    let data = {}, error

    const browserInstance = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
    const page = await browserInstance.newPage()


    try {

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

                    const upload_dir = path.join(__dirname, '../../../' + UPLOAD_DIR) + '/screenshots/'

                    if (Util.ensureDirectoryExistence(upload_dir)) {

                        const name = pipe.screenshot.name || (new Date()).getTime() + '.png'

                        await page.screenshot({path: upload_dir + name});
                        if (!data.screenshot) data.screenshot = []
                        data.screenshot.push(UPLOAD_URL + '/screenshots/' + name)
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
                    await page.evaluate(btn => btn.click(), btn)
                    await page.waitForNavigation({waitUntil: 'load'})


                } else if (pipe.waitForNavigation) {
                    await page.waitForNavigation(pipe.waitForNavigation)
                } else

                /* if (pipe.waitForSelector) {
                     await page.waitForSelector(pipe.waitForSelector.expr, {
                         timeout: pipe.waitForSelector.timeout || 10000
                     })
                 } else*/ if (pipe.waitFor) {
                    if (pipe.waitFor.constructor === Object) {
                        await page.waitFor(pipe.waitFor.expr, {timeout: pipe.waitFor.timeout || 10000})
                    } else {
                        await page.waitFor(pipe.waitFor, {timeout: 10000})
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

export {openInBrowser, processWebsiteQueue}
