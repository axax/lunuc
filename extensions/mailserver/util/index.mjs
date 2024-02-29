export const replaceAddresseObjectsToString = (messageData)=>  {
    const addressKeys = ['from', 'to', 'cc', 'bcc', , 'sender', 'reply-to', 'delivered-to', 'return-path']
    addressKeys.forEach(addressKey => {
        if (messageData[addressKey] && messageData[addressKey].value) {
            messageData[addressKey] = messageData[addressKey].value
        }
    })
}