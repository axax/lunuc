import { URL } from 'url'

export const replaceRelativeUrls = (html, baseUrl) => {
    if(!html){
        return ''
    }
    return html.replace(/(href|src)="([^"]*)"/g, (match, attr, relativeUrl) => {
        const absoluteUrl = new URL(relativeUrl, baseUrl).href
        return `${attr}="${absoluteUrl}"`
    })
}


/**/
//console.log(replaceRelativeUrls('<html><a href="https://www.google.ch/test"></a><img src="asdasd" /></html>', 'https://lunuc.com'))