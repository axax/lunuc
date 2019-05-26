import puppeteer from 'puppeteer'

const openInBrowser = async (options, scope, resolvedData) => {
    const {url, pipeline, images, ignoreSsl, waitUntil, timeout} = options
    let data = {}

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
                try {
                    await page.waitForSelector(pipe.waitForSelector.selector, {
                        timeout: pipe.waitForSelector.timeout || 10000
                    })
                } catch (err) {
                    throw err
                }

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

    /*
// Wait for the results page to load and display the results.
    const resultsSelector = '.filter-list__label-count';
    await page.waitForSelector(resultsSelector, {
        timeout: 10000
    });
// Extract the results from the page.
    const value = await page.evaluate(resultsSelector => {
        var el = document.querySelectorAll(resultsSelector);
        if (el && el.length>1) {
            return parseInt(el[2].innerText.substr(1).replace(/,/g,''))
        }
    }, resultsSelector);
    this.log(value);
    await browser.close();


    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
*/


    /*const instance = await phantom.create(['--ignore-ssl-errors=yes', '--load-images=no'], {
        logLevel: 'error', viewportSize: {width: 1600, height: 900},
        settings: {
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:49.0) Gecko/20100101 Firefox/49.0',
            javascriptEnabled: 'true',
            loadImages: 'false'
        }
    })
    const page = await instance.createPage();


    page.on('onResourceRequested', function (requestData) {
        //console.info('Requesting', requestData.url)
    })
    page.on('onLoadStarted', function () {
        //console.info('started')
    })
    page.on('onLoadFinished', function () {
        //console.info('finshed')
    })
    page.on('onNavigationRequested', function (targetUrl) {
        console.info('onNavigationRequested', targetUrl)
    })

    page.on('onError', function (msg, trace) {
        console.error(msg, trace)
    })

    page.on('onConsoleMessage', function (msg, lineNum, sourceId) {
        console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
    })

    const status = await page.open(url)
    let data = {}
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

            if (pipe.waitFor) {
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

            } else if (pipe.eval) {
                const tmpData = await evalFunc(pipe.eval)
                if (tmpData) {
                    data = {...data, ...tmpData}
                }
            } else if (pipe.open) {
                await page.open(pipe.open)
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

    await instance.exit()*/

    return {eval: data, debug: 'debug infos'}
}

export {openInBrowser}