import puppeteer from 'puppeteer'


export const doScreenCapture = async (url, filename, options) => {

    console.log(`take screenshot ${url}`)

    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    })
    const page = await browser.newPage()

    try {
        await page.goto(url, {waitUntil: 'domcontentloaded'})

        await page.setViewport({width: 1280, height: 800, ...options})
        if (options.delay) {
            await page.waitForTimeout(options.delay)
        }
        console.log(options)
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
                width: options.width - (l + r),
                height: options.height - (t + b)
            }
        }


        await page.screenshot({
            fullPage: false,
            path: filename,
            ...options
        })
        await page.close()
    }catch (e){}
    await browser.close()
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