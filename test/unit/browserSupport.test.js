import {parseUserAgent} from '../../util/userAgent.mjs'
import {needsInsecureHttp, needsServerSideRendering, hasSsrFallbackCookie} from '../../util/browserSupport.mjs'

const UA = {
    ie6: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)',
    ie10: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)',
    ie11: 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
    netscape3: 'Mozilla/3.01Gold (Win95; I)',
    netscape4: 'Mozilla/4.8 [en] (Windows NT 5.1; U)',
    mozilla17: 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.7.5) Gecko/20041217',
    firefox3: 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.9.0.10) Gecko/2009042316 Firefox/3.0.10',
    firefox20: 'Mozilla/5.0 (Windows NT 6.1; rv:20.0) Gecko/20100101 Firefox/20.0',
    firefox140: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
    chrome10: 'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/534.16 (KHTML, like Gecko) Chrome/10.0.648.204 Safari/534.16',
    chrome49: 'Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.112 Safari/537.36',
    chrome140: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    safari4: 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-us) AppleWebKit/531.21.8 (KHTML, like Gecko) Version/4.0.4 Safari/531.21.10',
    safari6: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/536.30.1 (KHTML, like Gecko) Version/6.0.5 Safari/536.30.1',
    safari18: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    opera9: 'Opera/9.80 (Windows NT 6.1; U; en) Presto/2.2.15 Version/10.00',
    opera12: 'Opera/9.80 (Windows NT 6.1; WOW64) Presto/2.12.388 Version/12.18'
}

const check = (name) => {
    const ua = parseUserAgent(UA[name])
    return {ssr: !!ua.noJsRendering, http: needsInsecureHttp(ua)}
}

describe('browserSupport', () => {
    it('serves the server side rendered page to browsers that cannot run the bundle', () => {
        for (const name of ['ie6', 'ie10', 'netscape3', 'netscape4', 'mozilla17', 'firefox3', 'chrome10', 'safari4', 'opera9']) {
            expect([name, check(name).ssr]).toEqual([name, true])
        }
        for (const name of ['ie11', 'firefox20', 'firefox140', 'chrome49', 'chrome140', 'safari6', 'safari18', 'opera12']) {
            expect([name, check(name).ssr]).toEqual([name, false])
        }
    })

    it('keeps browsers without tls 1.2 on http', () => {
        for (const name of ['ie6', 'ie10', 'netscape3', 'netscape4', 'mozilla17', 'firefox3', 'firefox20', 'chrome10', 'chrome49', 'safari4', 'safari6', 'opera9', 'opera12']) {
            expect([name, check(name).http]).toEqual([name, true])
        }
        for (const name of ['ie11', 'firefox140', 'chrome140', 'safari18']) {
            expect([name, check(name).http]).toEqual([name, false])
        }
    })

    it('serves the server side rendered page to text and proxy browsers', () => {
        for (const agent of [
            'Lynx/2.9.0dev.12 libwww-FM/2.14 SSL-MM/1.4.1 GNUTLS/3.7.8',
            'w3m/0.5.3+git20230121',
            'Links (2.29; Linux 6.1.0-13-amd64 x86_64; GNU C 12.2; text)',
            'ELinks/0.13.GIT (textmode; Linux 6.1 x86_64; 80x24-2)',
            'Dillo/3.0.5',
            'NetSurf/3.10 (Linux)',
            'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (S60; SymbOS; Opera Mobi/23.348; U; en) Presto/2.5.25 Version/10.54',
            'Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16'
        ]) {
            expect([agent, !!parseUserAgent(agent).noJsRendering]).toEqual([agent, true])
        }
        // not affected: modern Opera, LinkedIn bot preview is handled as bot
        expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0').noJsRendering).toBe(false)
    })

    it('keeps systems without the current root certificate on http', () => {
        const http = (agent) => needsInsecureHttp(parseUserAgent(agent))
        // android < 7.1.1
        expect(http('Mozilla/5.0 (Linux; Android 6.0.1; SM-G920F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Mobile Safari/537.36')).toBe(true)
        expect(http('Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/20.0 Chrome/106.0.0.0 Mobile Safari/537.36')).toBe(true)
        expect(http('Mozilla/5.0 (Linux; Android 7.1.1; Moto G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Mobile Safari/537.36')).toBe(false)
        expect(http('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')).toBe(false)
        // firefox has its own certificate store
        expect(http('Mozilla/5.0 (Android 6.0; Mobile; rv:115.0) Gecko/115.0 Firefox/115.0')).toBe(false)
        // ios < 10, every browser uses the system store
        expect(http('Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13G36 Safari/601.1')).toBe(true)
        expect(http('Mozilla/5.0 (iPad; CPU OS 9_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13E234 Safari/601.1')).toBe(true)
        expect(http('Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) FxiOS/7.5b3349 Mobile/13G36 Safari/601.1.46')).toBe(true)
        expect(http('Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_4 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.0 Mobile/14G61 Safari/602.1')).toBe(false)
        // macos < 10.12.1
        expect(http('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15')).toBe(true)
        expect(http('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36')).toBe(true)
        expect(http('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.11; rv:115.0) Gecko/20100101 Firefox/115.0')).toBe(false)
        expect(http('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_1) AppleWebKit/602.2.14 (KHTML, like Gecko) Version/10.0.1 Safari/602.2.14')).toBe(false)
        expect(http('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe(false)
        // windows is not affected
        expect(http('Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36')).toBe(false)
    })

    it('treats unknown browsers as modern', () => {
        expect(needsServerSideRendering(parseUserAgent('SomethingNew/1.0'))).toBe(false)
        expect(needsInsecureHttp(parseUserAgent('SomethingNew/1.0'))).toBe(false)
    })

    it('detects the fallback cookie', () => {
        expect(hasSsrFallbackCookie({headers: {cookie: 'a=b; lunucSsr=1'}})).toBe(true)
        expect(hasSsrFallbackCookie({headers: {cookie: 'lunucSsr=1; a=b'}})).toBe(true)
        expect(hasSsrFallbackCookie({headers: {cookie: 'xlunucSsr=1'}})).toBe(false)
        expect(hasSsrFallbackCookie({headers: {}})).toBe(false)
    })
})
