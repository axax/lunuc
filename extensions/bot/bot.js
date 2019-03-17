import natural from 'natural'
import Telegraf from 'telegraf'

class BotConnector {
    _ons = {}
    message = {text: ''}
    messageCount = 0

    constructor(message) {
        this.message.text = message
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
class Bot {

    static CONTEXTSTART = '__contextstart__'
    static CONTEXTEND = '__contextend__'

    threshold = 0.63
    ons = {}
    classifier = {}
    answers = {}
    telegramBot = false
    result = {}
    stopwords = {
        de: []
    }
    umlautMap = {
        'ü': 'u',
        'Ü': 'U',
        'ä': 'a',
        'Ä': 'A',
        'ö': 'o',
        'Ö': 'O',
        'é': 'e',
        'è': 'e',
        'à': 'a',
        'ß': 'ss',
    }

    constructor(data) {
        this.data = data
        this.languages = data.languages.split(',')
        if (this.languages.length === 0) {
            this.languages.push('en')
        }

        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i]
            this.classifier[lang] = new natural.LogisticRegressionClassifier()
            this.answers[lang] = {}
            this.classifier[lang].withContext = {}
        }

        if (data.telegramToken) {
            this.telegramBot = new Telegraf(data.telegramToken, {
                username: data.name
            })
        }
    }


    async loadCommands(db) {
        const botCommands = (await db.collection('BotCommand').find({bot: this.data._id, active: true}).toArray())


        botCommands.forEach(async botCommand => {

            if (botCommand.script) {
                //console.log(botCommand.script)
                const tpl = new Function(`
                 (async () => {
                    try {
                        const context = this.context
                        const on = this.context.on.bind(this.context);
                        const addExpression = this.context.addExpression.bind(this.context);
                        const addAnswer = this.context.addAnswer.bind(this.context);
                        const findAnswer = this.context.findAnswer.bind(this.context);
                        const natural = this.context.natural
                        const require = this.require;
                        ${botCommand.script}
                    } catch(e) {
                        console.log(e);
                    }
                })();
                `)

                const result = await tpl.call({
                    context: this,
                    require,
                })
            }
        })
    }

    start() {
        for (let i = 0; i < this.languages.length; i++) {
            const classifier = this.classifier[this.languages[i]]
            if (classifier.docs.length) {
                classifier.train()
            }

        }

        if (this.telegramBot) {

            Object.keys(this.ons).forEach(key => {
                this.telegramBot.on(key, ctx => {
                    this.communicate(key, ctx)
                })
            })
            this.telegramBot.launch()
        }
    }

    communicate(key, ctx) {
        if (ctx.message && ctx.message.text) {
            this.createNlpResult(ctx.message.text)
        }
        this.handleOn(key, ctx)
    }


    createNlpResult(text) {
        this.result = {}
        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i],
                intend = this.bestClassifierIntend(lang, text)

            let context = {}

            if (intend.value) {
                context = this.getConversationContext(lang, intend.label, text)
            }


            this.result[lang] = {
                intend: intend.label,
                intendValue: intend.value,
                context,
                answer: this.findAnswer(lang, intend.label, context)
            }
        }
    }

    getConversationContext(lang, key, text) {
        let finalContext = {}, bestDistance = 0
        const cls = this.classifier[lang]
        if (cls.withContext[key] && cls.withContext[key].length) {
            const textTokens = this.tokenizeAndStem(lang, text)
            cls.withContext[key].forEach(expr => {
                const exprTokens = this.tokenizeAndStem(lang, expr)

                if (textTokens.stemmed.length >= exprTokens.stemmed.length) {
                    let tmpContext = {}, totalDistance = 0, count = 0, currentKey, exprIdx = 0
                    for (let i = 0; i < textTokens.stemmed.length; i++) {
                        let pushit = false
                        if (exprTokens.stemmed[exprIdx].startsWith(Bot.CONTEXTSTART) && exprTokens.stemmed[exprIdx].endsWith(Bot.CONTEXTEND)) {
                            currentKey = exprTokens.stemmed[exprIdx].substring(Bot.CONTEXTSTART.length, exprTokens.stemmed[exprIdx].length - Bot.CONTEXTEND.length)
                            if (!tmpContext[currentKey + 'List']) {
                                tmpContext[currentKey + 'List'] = []
                                tmpContext[currentKey + 'StemmedList'] = []
                            }
                            pushit = true
                        } else {
                            const distance = natural.JaroWinklerDistance(textTokens.stemmed[i], exprTokens.stemmed[exprIdx])
                            //console.log(textTokens.stemmed[i], distance)
                            if (distance < 0.65 && currentKey) {
                                // it is probably a part of the context
                                pushit = true
                                exprIdx--
                            } else {
                                totalDistance += distance
                                count++
                            }
                        }

                        if (pushit) {
                            tmpContext[currentKey + 'List'].push(textTokens.original[i])
                            tmpContext[currentKey + 'StemmedList'].push(textTokens.stemmed[i])
                        }

                        exprIdx++
                        if (exprIdx >= exprTokens.stemmed.length) {
                            exprIdx = exprTokens.stemmed.length - 1
                        }
                    }
                    const avgDistance = totalDistance / count

                    if (avgDistance > 0.9 && avgDistance > bestDistance) {
                        bestDistance = avgDistance
                        if (tmpContext[currentKey + 'List']) {
                            tmpContext[currentKey] = tmpContext[currentKey + 'List'].join(' ')
                            tmpContext[currentKey + 'Stemmed'] = tmpContext[currentKey + 'StemmedList'].join(' ')
                        }
                        finalContext = tmpContext
                    }

                    //  console.log(textTokens.stemmed, exprTokens.stemmed)
                    //console.log(avgDistance)
                    //  console.log('distance', totalDistance / count)
                }
            })
        }

        return finalContext
    }


    enhanceWithContext(text, context) {

        if (context && Object.keys(context).length > 0 && text.indexOf('${') >= 0 && text.indexOf('}') > 0) {

            try {
                const result = new Function('const {' + Object.keys(context).join(',') + '} = this.context;return `' + text + '`').call({context})

                return result
            } catch (e) {
            }
        }
        return text
    }

    tokenizeAndStem(lang, text) {
        var tokenizer = new natural.RegexpTokenizer({pattern: new RegExp('[^A-Za-zА-Яа-я0-9_' + Object.keys(this.umlautMap).join() + ']+')});

        var finalTokens = {stemmed: [], original: []}
        var tokens = tokenizer.tokenize(text)


        tokens.forEach(token => {
            const tokenLowerCase = token.replace(new RegExp('[' + Object.keys(this.umlautMap).join('|') + ']', "g"),
                (a) => this.umlautMap[a]
            ).toLowerCase()

            if (tokenLowerCase.startsWith(Bot.CONTEXTSTART) === 0 && tokenLowerCase.endsWith(Bot.CONTEXTEND)) {
                finalTokens.stemmed.push(tokenLowerCase)
                finalTokens.original.push(token)
            } else if (this.stopwords[lang].indexOf(tokenLowerCase) == -1) {
                finalTokens.stemmed.push(natural.LancasterStemmer.stem(tokenLowerCase))
                finalTokens.original.push(token)
            }
        })
        return finalTokens
    }


    findAnswer(lang, key, context) {
        if (key && this.answers[lang] && this.answers[lang][key]) {
            const arr = this.answers[lang][key]
            const answer = arr[Math.floor(Math.random() * arr.length)]
            return this.enhanceWithContext(answer, context)
        }
    }

    bestClassifierIntend(lang, text) {
        const classifier = this.classifier[lang]
        if (classifier.docs.length) {
            const result = classifier.getClassifications(text)
            //console.log(result)
            if (result.length && result[0].value > this.threshold) {
                return result[0]
            }
        }
        return {label: '', value: 0}
    }

    async handleOn(key, api) {
        console.log(key)
        const arr = this.ons[key]
        if (arr) {
            for (let i = 0; i < arr.length; i++) {
                const res = await arr[i]({api, ...this.result})
                if (res) {
                    return res
                }
            }
        }
    }

    destroy() {
        if (this.telegramBot) {
            this.telegramBot.stop()
        }
    }

    addExpression(lang, expressions, key) {
        if (expressions.constructor !== Array) {
            expressions = [expressions]
        }
        expressions.forEach(expr => {
            const cls = this.classifier[lang]
            if (expr.indexOf('${') >= 0 && expr.indexOf('}') >= 0) {
                if (!cls.withContext[key]) {
                    cls.withContext[key] = []
                }
                cls.withContext[key].push(expr.replace(/\${/g, Bot.CONTEXTSTART).replace(/}/g, Bot.CONTEXTEND))
                this.classifier[lang].addDocument(expr.replace(/\$\{[A-z0-9_]*?\}/g, ''), key)
            } else {

                this.classifier[lang].addDocument(expr, key)
            }
        })
    }

    addAnswer(lang, answers, key) {
        if (answers.constructor !== Array) {
            answers = [answers]
        }
        answers.forEach(answer => {
            if (!this.answers[lang][key]) {
                this.answers[lang][key] = []
            }
            this.answers[lang][key].push(answer)
        })
    }

    on(keys, cb) {
        if (keys.constructor !== Array) {
            keys = [keys]
        }
        keys.forEach(key => {
            if (!this.ons[key]) {
                this.ons[key] = []
            }
            this.ons[key].push(cb)
        })
    }

}


let registeredBots = {}

const registerBots = async (db) => {
    const bots = (await db.collection('Bot').find({active: true}).toArray())


    bots.forEach(async botData => {
            const bot = new Bot(botData)

            await bot.loadCommands(db)

            bot.start()

            registeredBots[botData._id] = bot


            /*
             bot.start((ctx) => ctx.reply('Welcome!'))
             bot.help((ctx) => ctx.reply('Send me a sticker'))
             bot.on('sticker', (ctx) => ctx.reply('👍'))
             bot.hears('hi', (ctx) => ctx.reply('Hey there'))
             bot.hears(/rahel/i, (ctx) => ctx.reply('Ach Rahel ist die beste 😍🥰😘'))
             bot.hears(/salo/i, (ctx) => ctx.reply('Meinst du mit salo Salomè?'))
             bot.launch()*/
            // console.log(botCommand)
            /* let match = true
             if (cronJob.execfilter) {
             match = cronjobUtil.execFilter(cronJob.execfilter)
             }

             if (match) {

             registeredBots.push(cron.schedule(cronJob.expression, () => {

             const context = {lang: 'en', id: cronJob.createdBy, username: 'unknown'}
             cronjobUtil.runScript({cronjobId: cronJob._id, script: cronJob.script, context, db})

             }))
             }*/
        }
    )
}


const unregisterBots = (db) => {
    Object.keys(registeredBots).forEach(id => {
        registeredBots[id].destroy()
    })

    registeredBots = {}
}

export {BotConnector, unregisterBots, registerBots, registeredBots}
