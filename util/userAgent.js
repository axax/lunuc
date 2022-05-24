
// /WhatsApp|TelegramBot|AhrefsBot|Applebot|x28-job-bot|bingbot|msnbot|YandexBot|PetalBot|Googlebot|facebookexternalhit|LinkedInBot|Twitterbot|Xing|AdsBot/
export const parseUserAgent = (agent, botregex = /bot|crawl|slurp|spider|mediapartners/i) => {

    let browser, version, isBot = false
    if (agent) {

        isBot = botregex.test(agent)

        const agentParts = agent.toLowerCase().split(' ')

        if (agentParts.length > 3) {
            const androidPos = agentParts.indexOf('android');
            if(androidPos>=0 && agentParts[androidPos+1]){
                browser='android'
                version=parseFloat(agentParts[androidPos+1])
            }else if (agentParts[0].indexOf('opera/') === 0) {
                browser = 'opera'
                version = parseFloat(agentParts[0].substring(6))
            } else if (agentParts[agentParts.length - 1].endsWith(')')) {

                if (agentParts[2] === 'msie') {

                    browser = 'msie'
                    version = parseFloat(agentParts[3])
                } else if(agentParts[0] === 'microsoft' && agentParts[1] === 'internet' && agentParts[2].indexOf('explorer/') === 0) {

                    browser = 'msie'
                    version = parseFloat(agentParts[2].substring(9))

                }
            } else {

                const browserPart = agentParts[agentParts.length - 1].split('/'),
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

    return {browser, version, isBot}

}

/*console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 4.4.2; SUNSET Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 8.0.0; Android SDK built for x86 Build/OSR1.180418.026) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:100.0) Gecko/20100101 Firefox/100.0'))
*/
