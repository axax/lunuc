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