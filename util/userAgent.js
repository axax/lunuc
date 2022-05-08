export const parseUserAgent = (agent, botregex = /WhatsApp|TelegramBot|AhrefsBot|bingbot|msnbot|YandexBot|PetalBot|Googlebot|facebookexternalhit|LinkedInBot|Twitterbot|Xing|AdsBot/) => {


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

        }
    }

    return {browser, version, isBot}

}

/*console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 4.4.2; SUNSET Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36'))
console.log(parseUserAgent('Mozilla/5.0 (Linux; Android 8.0.0; Android SDK built for x86 Build/OSR1.180418.026) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36'))
*/
