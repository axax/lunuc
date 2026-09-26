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

export const removeStyleAndScriptTags = (html) => {
    // Single regex to remove both <style> and <script> tags with their content
    return html.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
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

/*
 * Cipher order for the SMTP/IMAP TLS contexts: ECDSA suites before RSA suites.
 *
 * Why: smtp-server and wildduck always create a default ('*') context with their
 * built-in self-signed RSA cert (CN=localhost). When the SNICallback returns a
 * hostrule context, Node only overwrites the certificate slot of the SAME key type
 * (SSL_use_certificate). With a Let's Encrypt ECDSA cert the RSA slot keeps the
 * localhost cert, and since Node's default list prefers ECDHE-RSA and
 * honorCipherOrder is on, TLS 1.2 clients (e.g. iOS Mail) got the expired
 * localhost cert or "no shared cipher". Preferring ECDSA picks the hostrule cert;
 * RSA hostrule certs still overwrite the RSA slot, so they keep working.
 */
export const MAIL_TLS_CIPHERS = [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'DHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES128-SHA256',
    'ECDHE-RSA-AES128-SHA256',
    'DHE-RSA-AES128-SHA256',
    'ECDHE-ECDSA-AES256-SHA384',
    'ECDHE-RSA-AES256-SHA384',
    'DHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES256-SHA256',
    'DHE-RSA-AES256-SHA256',
    'HIGH',
    '!aNULL', '!eNULL', '!EXPORT', '!DES', '!RC4', '!MD5', '!PSK', '!SRP', '!CAMELLIA'
].join(':')
