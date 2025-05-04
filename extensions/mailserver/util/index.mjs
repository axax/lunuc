export const replaceAddresseObjectsToString = (messageData)=>  {
    const addressKeys = ['from', 'to', 'cc', 'bcc','replyTo','inReplyTo' , 'sender', 'in-reply-to','reply-to', 'delivered-to', 'return-path']
    addressKeys.forEach(addressKey => {
        if (messageData[addressKey] && messageData[addressKey].value) {
            messageData[addressKey] = messageData[addressKey].value
        }
    })
}

export const getCircularReplacer = () => {
    const seen = new WeakSet()
    return (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return // Omit circular reference
            }
            seen.add(value)
        }
        return value
    }
}

export const removeHtmlTags = (html) => {
    return html.replace(/<\/?[^>]+(>|$)/g, '')
}

export const decodeHtmlEntities = (input) => {
    const entitiesMap = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&auml;': 'ä',
        '&ouml;': 'ö',
        '&uuml;': 'ü',
        '&Auml;': 'Ä',
        '&Ouml;': 'Ö',
        '&Uuml;': 'Ü',
        '&szlig;': 'ß',
        // Add more HTML entities here as needed
    }

    return input.replace(/&#(\d+);|&#x([0-9a-fA-F]+);|&[a-zA-Z0-9]+;/g, (match, dec, hex, named) => {
        if (dec) return String.fromCharCode(parseInt(dec, 10)) // Decimal entities
        if (hex) return String.fromCharCode(parseInt(hex, 16)) // Hex entities
        return entitiesMap[match] || match // Named entities or unchanged
    })
}

//console.log(decodeHtmlEntities(removeHtmlTags('&#119558; ---- <p align=\\"center\\" dir=\\"auto\\" style=\\"color: rgb(43, 46, 47); font-size: 18px; line-height: 24px; margin: 5px 0px;\\">Foo &#xA9; bar &#x1D306; baz &#x2603; &#xE4;Versandkosten bitte best&auml;tigen (1,48 CHF) und Paketversand,</p>')))