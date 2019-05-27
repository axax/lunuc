import puppeteer from 'puppeteer'

const openInBrowser = async (options, scope, resolvedData) => {
    const {url, pipeline, images, ignoreSsl, waitUntil, timeout} = options
    let data = {}, error

    const browser = await puppeteer.launch({ignoreHTTPSErrors: ignoreSsl})
    const page = await browser.newPage()
    const gotoOptions = {waitUntil, timeout}

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

    try {
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

                if (pipe.waitForSelector) {
                    await page.waitForSelector(pipe.waitForSelector.selector, {
                        timeout: pipe.waitForSelector.timeout || 10000
                    })

                    /*}else if (pipe.waitFor) {
                        const startTime = new Date()
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
                        }
                    */
                } else if (pipe.eval) {
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
        await browser.close()
    } catch (e) {
        console.error(e)
        error = e.message
    }

    return {eval: data, error}
}

export {openInBrowser}