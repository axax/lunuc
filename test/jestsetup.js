console.log('preparing jest...')

// window.fetch polyfill
global.fetch = require('unfetch')

// fake websocket
global.WebSocket = ()=>{}

// fake localstorage
var storage = {}
global.localStorage = {
    getItem: function(key) {
        return storage[key] || null
    },
    setItem: function(key, value) {
        storage[key] = String(value)
    },
    removeItem: function(key) {
        delete storage[key]
    },
    clear: function() {
        storage = {}
    }
}