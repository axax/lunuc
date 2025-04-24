import puppeteer from 'puppeteer'
import ApiUtil from '../../api/util/index.mjs'
import {isTemporarilyBlocked} from './requestBlocker.mjs'


export const doScreenCapture = async (url, filename, options) => {

    if(isTemporarilyBlocked({requestTimeInMs: 2000, requestPerTime: 2,requestBlockForInMs:6000, key:'doScreenCapture'})){
        return {location: `/lunucapi/system/genimage?width=${options.width || 600}&height=${options.height || 600}&text=Server%20busy.%20Please%20try%20again%20later`, statusCode: 302}
    }

    console.log(`take screenshot ${url}`)

    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true, /* deprecated */
        acceptInsecureCerts:true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    })
    const page = await browser.newPage()

    try {
        await page.goto(url, {waitUntil: 'domcontentloaded'})

        await page.setViewport({width: 1280, height: 800, ...options})
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
        const escapedPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
            .replace(/\*/g, '.*?') // Convert * to non-greedy match

        // Create regex from pattern, preserving capturing groups
        const regex = new RegExp(`^${escapedPattern}$`)

        // Test if URL matches pattern
        const match = url.match(regex)
        if (match) {
            // Replace {1}, {2}, etc. with captured groups
            let newUrl = redirectTemplate
            match.slice(1).forEach((group, index) => {
                newUrl = newUrl.replace(`{${index + 1}}`, group || '')
            })
            return newUrl
        }
    }
    return null // No match found
}