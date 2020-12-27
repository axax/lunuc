export const parseUserAgent = agent => {


    let browser, version, isBot = false
    if (agent) {
        if (agent.indexOf('bingbot') >= 0) {
            browser = 'bingobt'
            isBot = true
        } else if (agent.indexOf('msnbot') >= 0) {
            browser = 'msnbot'
            isBot = true
        } else if (agent.indexOf('YandexBot') >= 0) {
            browser = 'yandexbot'
            isBot = true
        } else if (agent.indexOf('PetalBot') >= 0) {
            browser = 'petalbot'
            isBot = true
        }

        const agentParts = agent.toLowerCase().split(' ')

        if (agentParts.length > 3) {

            if (agentParts[0].indexOf('opera/') === 0) {
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
