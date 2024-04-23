export const replaceAddresseObjectsToString = (messageData)=>  {
    const addressKeys = ['from', 'to', 'cc', 'bcc','replyTo','inReplyTo' , 'sender', 'in-reply-to','reply-to', 'delivered-to', 'return-path']
    addressKeys.forEach(addressKey => {
        if (messageData[addressKey] && messageData[addressKey].value) {
            messageData[addressKey] = messageData[addressKey].value
        }
    })
}