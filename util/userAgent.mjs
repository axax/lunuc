
// /WhatsApp|TelegramBot|AhrefsBot|Applebot|x28-job-bot|bingbot|msnbot|YandexBot|PetalBot|Googlebot|facebookexternalhit|LinkedInBot|Twitterbot|Xing|AdsBot/
export const parseUserAgent = (agent, botregex = /bot|crawl|slurp|spider|mediapartners|facebookexternalhit|Xing|WhatsApp/i) => {

    let browser, version, isBot = false, mobile = false
    if (agent) {

        isBot = botregex.test(agent)

        const agentParts = agent.replace(/\s{2,}/g, ' ').trim().toLowerCase().split(' ')
        if (agentParts.length > 3) {
            const androidPos = agentParts.indexOf('android')
            const lastPart = agentParts[agentParts.length-1]
            if(androidPos>=0 && agentParts[androidPos+1]) {
                browser = 'android'
                version = parseFloat(agentParts[androidPos + 1])
            }else if (agentParts[agentParts.length-2].startsWith('mobile/') ) {
                const idx = (agentParts[agentParts.length-3].indexOf('/')>0?3 : 1)
                const parts = agentParts[agentParts.length - idx].split('/')
                if(parts[0]==='version') {
                    browser = 'safari'
                }else{
                    browser = parts[0]
                }
                mobile=true
                version = parseFloat(parts[1])
            }else if (lastPart.indexOf('opr/') === 0) {
                browser = 'opera'
                version = parseFloat(lastPart.substring(4))
            }else if (lastPart.indexOf('navigator/') === 0) {
                browser = 'netscape'
                version = parseFloat(lastPart.substring(10))
            } else if (lastPart.endsWith(')') || lastPart.endsWith('gecko')) {

                browser = 'msie'
                version = 1

                if(agentParts[agentParts.length-3].startsWith('rv:')){
                    version = parseFloat(agentParts[agentParts.length-3].substring(3))
                }else if (agentParts[2] === 'msie') {

                    browser = 'msie'
                    version = parseFloat(agentParts[3])
                } else if(agentParts[0] === 'microsoft' && agentParts[1] === 'internet' && agentParts[2].indexOf('explorer/') === 0) {

                    browser = 'msie'
                    version = parseFloat(agentParts[2].substring(9))

                }
            } else {

                const browserPart =lastPart.split('/'),
                    versionPart = agentParts[agentParts.length - 2].split('/')
                browser = browserPart[0].trim()
                if (versionPart.length > 1 && versionPart[0] !== 'gecko' && browser !== 'edg') {
                    version = parseFloat(versionPart[1])
                    if (versionPart[0] !== 'version') {
                        browser = versionPart[0]
                    }
                } else if (browserPart.length > 1) {
                    version = parseFloat(browserPart[1])
                }

            }
        } else if(agentParts.length > 0){
            if (agentParts[0].indexOf('mozilla/') === 0) {
                browser = 'netscape'
                version = parseFloat(agentParts[0].substring(8))
            }
        }
    }

    if(browser==='opr'){
        browser='opera'
    }else if(browser.length > 8 && browser.startsWith('netscape')){
        browser='netscape'
    }


    return {browser, version, mobile, isBot}

}
/*
console.log(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.53 Safari/537.36\n'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OPT/3.3.0'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/98.0.4758.85 Mobile/15E148 Safari/604.1'))
console.log(parseUserAgent('Mozilla/5.0 (iPhone; CPU OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/22.0  Mobile/15E148 Safari/605.1.15'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 4.4.2; SUNSET Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 8.0.0; Android SDK built for x86 Build/OSR1.180418.026) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:100.0) Gecko/20100101 Firefox/100.0'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko'))
console.log(parseUserAgent('Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 5.1; Trident/4.0)'))
console.log(parseUserAgent('Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)'))
console.log(parseUserAgent('Mozilla/2.02Gold (Win95; I)'))
console.log(parseUserAgent('Mozilla/5.0 (X11; U; SunOS sun4u; en-US; rv:0.9.4.1) Gecko/20020406 Netscape6/6.2.2'))
console.log(parseUserAgent('Mozilla/5.0 (Windows; U; Win98; en-US; rv:1.7.5) Gecko/20060127 Netscape/8.1'))
console.log(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.52 Safari/537.36 OPR/15.0.1147.132'))
console.log(parseUserAgent(' Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1'))
console.log(parseUserAgent(' Mozilla/5.0 (iPad; CPU OS 10_3_3 like Mac OS X) AppleWebKit/603.3.8 (KHTML, like Gecko) Version/10.0 Mobile/14G60 Safari/602.1'))

*/
