class BotConnector {
    _ons = {}
    message = {text: '', from: {first_name: 'Someone'}}
    messageCount = 0

    constructor() {

    }

    setMessage(message) {
        this.message = message
    }

    reply(text) {
        this.messageCount++
        if (this._ons['text']) {
            this._ons['text'].forEach(cb => {
                cb(text, this.messageCount)
            })
        }
        return {message_id: this.messageCount}
    }

    replyWithHTML(html) {
        this.messageCount++
        if (this._ons['text']) {
            this._ons['text'].forEach(cb => {
                cb(html, this.messageCount)
            })
        }
        return {message_id: this.messageCount}
    }

    deleteMessage(id) {
        if (this._ons['deleteMessage']) {
            this._ons['deleteMessage'].forEach(cb => {
                cb(id)
            })
        }
    }

    on(event, cb) {
        if (!this._ons[event]) {
            this._ons[event] = []
        }
        this._ons[event].push(cb)
    }
}

export default BotConnector