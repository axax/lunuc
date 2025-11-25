// /WhatsApp|TelegramBot|AhrefsBot|Applebot|x28-job-bot|bingbot|msnbot|YandexBot|PetalBot|Googlebot|facebookexternalhit|LinkedInBot|Twitterbot|Xing|AdsBot/

// exception if it starts with spiderweb/ because that is a browser
export const DEFAULT_BOT_REGEX = /(?!(^spiderweb\/))(leakix.net|bot|ChatGPT|GoogleOther|Google-Apps-Script|crawl|slurp|spider|mediapartners|facebookexternalhit|Xing|WhatsApp|NetcraftSurveyAgent|\(compatible; ITools;)/i
export const DEFAULT_BOT_WITH_NO_JS_SUPPORT_REGEX = /YandexBot|SEBot-WA|Bytespider|OAI-SearchBot|GPTBot|ClaudeBot|PerplexityBot|Meta-ExternalAgent|meta-webindexer|Frog SEO Spider|Iframely|AhrefsSiteAudit|SeekportBot|SeobilityBot|DuckDuckBot|localsearch|facebookexternalhit|LinkedInBot|Xing|WhatsApp|TelegramBot|\(compatible; ITools;/i
export const parseUserAgent = (agent, setting = {}) => {


    let {botRegex, noJsRenderingBotRegex, via} = setting

    if(!botRegex || !botRegex.test){
        botRegex = DEFAULT_BOT_REGEX
    }
    if(!noJsRenderingBotRegex || !noJsRenderingBotRegex.test){
        noJsRenderingBotRegex = DEFAULT_BOT_WITH_NO_JS_SUPPORT_REGEX
    }

    if(via && via.indexOf('archive.org_bot') >= 0){
        // https://web.archive.org/
        return {isBot: true, noJsRendering: true}
    }

    let result = {}
    if (agent) {
        const agentLower = agent.toLowerCase().trim()
        result.isBot = botRegex.test(agentLower)

        if (result.isBot) {
            result.noJsRendering = noJsRenderingBotRegex.test(agentLower)
        }else{


            const raw = parseUserAgentRaw(agentLower)


            if (raw.mobile) {
                result.mobile = true
            }

            if (raw.opr) {

                result.browser = 'opera'
                result.version = parseFloat(raw.opr.version)

            } else if (raw.opera) {

                result.browser = 'opera'


                if (raw.version) {
                    result.version = parseFloat(raw.version.version)
                } else {
                    result.version = parseFloat(raw.opera.version)
                }
            } else if (raw.opt) {

                result.browser = 'opt'
                result.version = parseFloat(raw.opt.version)

            } else if (raw.edge) {

                result.browser = 'edge'
                result.version = parseFloat(raw.edge.version)

            } else if (raw.fxios) {

                result.browser = 'fxios'
                result.version = parseFloat(raw.fxios.version)

            } else if (raw.firefox) {

                result.browser = 'firefox'
                result.version = parseFloat(raw.firefox.version)

            } else if (raw.chrome) {

                result.browser = 'chrome'
                result.version = parseFloat(raw.chrome.version)

            } else if (raw.headlesschrome) {

                result.browser = 'chrome'
                result.version = parseFloat(raw.headlesschrome.version)

            } else if (raw.crios) {

                result.browser = 'chrome'
                result.version = parseFloat(raw.crios.version)

            } else if (raw.netscape) {

                result.browser = 'netscape'
                result.version = parseFloat(raw.netscape.version)

            } else if (raw.netscape6) {

                result.browser = 'netscape'
                result.version = parseFloat(raw.netscape6.version)

            } else if (raw.applewebkit) {

                result.browser = 'safari'

                if (raw.version) {
                    result.version = parseFloat(raw.version.version)
                }
            } else if (raw.spiderweb) {

                result.browser = 'spiderweb'
                result.version = parseFloat(raw.spiderweb.version)
            } else if (raw.mozilla) {

                const allKeys = Object.keys(raw)

                if (allKeys.length === 3 && raw.gecko && raw.like && raw.mozilla.rv) {
                    result.browser = 'msie'
                    result.version = parseFloat(raw.mozilla.rv)
                } else if (allKeys.length === 1) {

                    if (raw.mozilla.msie) {
                        result.browser = 'msie'
                        result.version = parseFloat(raw.mozilla.msie)
                    } else if (raw.mozilla.win95) {
                        result.browser = 'netscape'
                        result.version = parseFloat(raw.mozilla.version)
                    } else {
                        for (const key of Object.keys(raw.mozilla)) {
                            if (key.startsWith('msie')) {
                                const version = key.substring(4)
                                if (!isNaN(version)) {
                                    result.browser = 'msie'
                                    result.version = parseFloat(version)
                                    break
                                }
                            }
                        }
                    }
                }

            }
            result.raw = raw

            result.noJsRendering = (result.browser === 'netscape') ||
                (result.browser === 'safari' && result.version < 5) ||
                (result.browser === 'firefox' && result.version <= 12) ||
                (result.browser === 'opera' && result.version <= 10) ||
                (result.browser === 'chrome' && result.version <= 16) ||
                (result.browser === 'msie' && result.version <= 10)

        }
    }

    if (!result.version || result.version < 0 || isNaN(result.version)) {
        result.version = 999
    }

    if (!result.browser) {
        result.browser = 'unknown'
    }

    return result

}


export const parseUserAgentRaw = (() => {

    //useragent strings are just a set of phrases each optionally followed by a set of properties encapsulated in paretheses
    const part = /\s*([^\s/]+)(\/(\S+)|)(\s+\(([^)]+)\)|)/g
    //these properties are delimited by semicolons
    const delim = /;\s*/
    //the properties may be simple key-value pairs if;
    const single = [
        //it is a single comma separation,
        /^([^,]+),\s*([^,]+)$/,
        //it is a single space separation,
        /^(\S+)\s+(\S+)$/,
        //it is a single colon separation,
        /^([^:]+):([^:]+)$/,
        //it is a single slash separation
        /^([^/]+)\/([^/]+)$/,
        //or is a special string
        /^(.NET CLR|Windows)\s+(.+)$/
    ];
    //otherwise it is unparsable because everyone does it differently, looking at you iPhone
    const many = / +/
    //oh yeah, bots like to use links
    const link = /^\+(.+)$/

    const inner = (properties, property) => {
        let tmp
        if (tmp = property.match(link)) {
            properties.link = tmp[1]
        } else if (tmp = single.reduce((match, regex) => (match || property.match(regex)), null)) {
            properties[tmp[1]] = tmp[2]
        } else if (many.test(property)) {
            if (!properties.properties)
                properties.properties = []
            properties.properties.push(property)
        } else {
            properties[property] = true
        }

        return properties
    }

    return (input) => {
        const output = {};
        for (let match; match = part.exec(input); '') {
            output[match[1]] = {
                ...(match[5] && match[5].split(delim).reduce(inner, {})),
                ...(match[3] && {version: match[3]})
            }
        }
        return output
    }
})()


//console.log(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'))
//console.log(parseUserAgent('Mozilla/5.0 (compatible; ITools; Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582)')) // search.ch
//console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)'))
/*console.log(parseUserAgent('Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763'))
console.log(parseUserAgent('Opera/9.80 (Linux armv7l) Presto/2.12.407 Version/12.51 , D50u-D1-UHD/V1.5.16-UHD (Vizio, D50u-D1, Wireless)'))
console.log(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:45.0) Gecko/20100101 Thunderbird/45.8.0'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/217.0.454508427 Mobile/15E148 Safari/604.1'))
console.log(parseUserAgent('Mozilla/6.0 (compatible; MSIE7.00; Windows 2009)'))
console.log(parseUserAgent('Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 5.1; Trident/4.0)'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 7.0;) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)'))
console.log(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/104.0.5109.0 Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36 OPR/88.0.4412.40'))
console.log(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_3) AppleWebKit/601.4.4 (KHTML, like Gecko) Version/9.0.3 Safari/601.4.4'))
console.log(parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:68.0) Gecko/20100101 Firefox/68.0'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 6.0.1; SM-G925I Build/MMB29K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/56.0.2924.87 Mobile Safari/537.36\n'))
console.log(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.53 Safari/537.36\n'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OPT/3.3.0'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/98.0.4758.85 Mobile/15E148 Safari/604.1'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/22.0  Mobile/15E148 Safari/605.1.15'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; U; Android 3.1; en-gb; GT-P7500 Build/HMJ37) AppleWebKit/534.13 (KHTML, like Gecko) Version/4.0 Safari/534.13'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 4.4.2; SUNSET Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 8.0.0; Android SDK built for x86 Build/OSR1.180418.026) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:100.0) Gecko/20100101 Firefox/100.0'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'))
console.log(parseUserAgent('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)'))
console.log(parseUserAgent('Mozilla/2.02Gold (Win95; I)'))
console.log(parseUserAgent('Mozilla/5.0 (X11; U; SunOS sun4u; en-US; rv:0.9.4.1) Gecko/20020406 Netscape6/6.2.2'))
console.log(parseUserAgent('Mozilla/5.0 (Windows; U; Win98; en-US; rv:1.7.5) Gecko/20060127 Netscape/8.1'))
console.log(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.52 Safari/537.36 OPR/15.0.1147.132'))
console.log(parseUserAgent('AppleCoreMedia/1.0.0.16H62 (iPad; U; CPU OS 12_5_5 like Mac OS X; nl_nl)'))
console.log(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 12_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'))
console.log(parseUserAgent(' Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1'))
console.log(parseUserAgent(' Mozilla/5.0 (iPad; CPU OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.0 Mobile/14G60 Safari/602.1'))
console.log(parseUserAgent('Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 5.2; WOW64; Trident/4.0)'))
console.log(parseUserAgent('Mozilla/5.0 (compatible; MegaIndex.ru/2.0; +http://megaindex.com/crawler)'))
console.log(parseUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))*/