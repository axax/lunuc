import { URL } from 'url'

export const replaceRelativeUrls = (html, baseUrl) => {
    if(!html){
        return ''
    }
    return html.replace(/(href|src)="([^"]*)"/g, (match, attr, relativeUrl) => {
        if (/^(https?|file|ftps?|mailto|javascript|data:image\/[^;]{2,9};):/i.test(relativeUrl)) {
            return `${attr}="${relativeUrl}"` // url is already absolute
        }

        const absoluteUrl = new URL(relativeUrl, baseUrl).href
        return `${attr}="${absoluteUrl}"`
    })
}


/**/
console.log(replaceRelativeUrls('<html><a href="https://www.google.ch/test"></a><img src="https://www.bbfzuf.ch/lunucapi/tracking?url=https%3A%2F%2Fwww.bbfzuf.ch%2F&subscriber=&mailing=675805af595620b3167bbe42" /></html>', 'https://lunuc.com'))