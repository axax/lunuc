import puppeteer from 'puppeteer'
import {isTemporarilyBlocked} from './requestBlocker.mjs'

const MAX_PAGES_IN_PUPPETEER = 8

let parseWebsiteBrowser
const wasBrowserKilled = async (browser) => {
    if(!browser){
        return true
    }

    if(!browser.process){
        return false
    }

    const procInfo = await browser.process()

    return !!procInfo.signalCode // null if browser is still running
}

export const parseWebsite = async (urlToFetch, {host, agent, referer, isBot, remoteAddress, cookies}) => {

    if(isTemporarilyBlocked({requestTimeInMs: 3000, requestPerTime: 8,requestBlockForInMs:30000, key:'parseWebsite'})){
        return {html: '503 Service Unavailable', statusCode: 503}
    }

    let page
    try {
        const startTime = new Date().getTime()

        console.log(`parseWebsite fetch ${urlToFetch}`)
        if(await wasBrowserKilled(parseWebsiteBrowser)) {

            console.log(`create new browser instance`)

            parseWebsiteBrowser = await puppeteer.launch({
                headless:'new',
                devtools: false,
                /*userDataDir: './server/myUserDataDir',*/
                ignoreHTTPSErrors: true, /* deprecated */
                acceptInsecureCerts:true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-zygote' /* Disables the use of a zygote process for forking child processes. Instead, child processes will be forked and exec'd directly.*/
                ]
            })
        }
        const pages = await parseWebsiteBrowser.pages()
        if( pages.length > MAX_PAGES_IN_PUPPETEER){
            console.warn('browser too busy to process more requests -> ignore')
            return {html: 'too busy to process request', statusCode: 500}
        }

        page = await parseWebsiteBrowser.newPage()

        setTimeout(async () => {
            /* if page is still not closed after 20s something is wrong */
            try {
                if(!page.isClosed() && !(await wasBrowserKilled(page.browser()))) {
                    //await pages.forEach(async (page) => await page.close())

                    parseWebsiteBrowser.process().kill('SIGINT')
                    console.log('browser still running after 20s. kill process')

                    parseWebsiteBrowser = false
                }
            }catch (e) {
                console.warn("error termination process",e)
            }

        }, 20000)


        await page.setDefaultTimeout(15000)
        await page.setRequestInterception(true)



        // always clear auth cookie
        await page.setCookie({domain:'localhost',name:'auth', value:''})

        if( cookies && Object.keys(cookies).length>0 && !isBot/*&& cookies.session && cookies.auth*/) {
            console.log(`Taking over the session can be dangerous. ${urlToFetch}`, Object.keys(cookies))
            const cookiesToSet = Object.keys(cookies).map(k=>({domain:'localhost',name:k, value:cookies[k]}))
            await page.setCookie(...cookiesToSet)
        }

        await page.setExtraHTTPHeaders({'x-host-rule': host})
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'manifest', 'other'].indexOf(request.resourceType()) !== -1 ||
                request.frame().url() !== page.mainFrame().url() /* in iframe */) {
                request.abort()
            } else {
                const headers = request.headers()
                headers['x-track-referer'] = referer
                headers['x-track-ip'] = remoteAddress
                headers['x-track-host'] = host
                headers['x-track-is-bot'] = isBot
                headers['x-track-user-agent'] = agent
                request.continue({headers})
            }
        })

        let statusCode = 200
        page.on('response', response => {
            if (response.status() === 404 && response.request().resourceType() === 'document' && response.url().endsWith('/404')) {

                statusCode = 404
            }
        })



        await page.evaluateOnNewDocument((data) => {
            window._elementWatchForceVisible = true
            window._disableWsConnection = true
            window._lunucWebParser = data
        },{host, agent, isBot, remoteAddress})


        await page.goto(urlToFetch, {waitUntil: 'networkidle2'})

        let html = await page.content()
        html = html.replace('</head>', '<script>window.LUNUC_PREPARSED=true</script></head>')

        console.log(`url fetched ${urlToFetch} (statusCode ${statusCode}} in ${new Date().getTime() - startTime}ms`)

        await page.close()

        /*try {


            const pages = await parseWebsiteBrowser.pages()
            await pages.forEach(async (page) => await page.close())

        }catch (e) {
            console.error(e)
        }*/
        //console.log(`Step 7 ${new Date().getTime() - startTime}ms`)

        //await browser.close()

        return {html, statusCode}
    } catch (e) {
        console.warn('parseWebsite error ' + urlToFetch,e)
        if(page && !page.isClosed()){
            page.close()
        }
        return {html: e.message, statusCode: 500}

    }
}