
chrome.runtime.onMessage.addListener(function (message, sender, callback) {
    if (message.command === 'ytCookies') {
        chrome.cookies.getAll({domain: "youtube.com"}, function (cookies) {
            callback(cookies)
        })
        return true
    }
})
