import natural from 'natural'
import Telegraf from 'telegraf'
import Stemmer from './classes/Stemmer'
import BotConnector from './classes/BotConnector'
import stopwords_en from 'natural/lib/natural/util/stopwords'

class Bot {

    threshold = 0.8
    ons = {}
    stemmer = {}
    classifier = {}
    answers = {}
    telegramBot = false
    result = {}
    stopwords = {
        de: [],
        en: stopwords_en.words
    }
    charsToKeep = {
        de: {
            'ü': 'u',
            'Ü': 'U',
            'ä': 'a',
            'Ä': 'A',
            'ö': 'o',
            'Ö': 'O',
            'é': 'e',
            'è': 'e',
            'à': 'a',
            'ß': 'ss'
        }
    }

    constructor(data) {
        this.data = data
        this.languages = data.languages.split(',')
        if (this.languages.length === 0) {
            this.languages.push('en')
        }
        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i]
            this.stemmer[lang] = new Stemmer(this.stopwords[lang], this.charsToKeep[lang])
            this.classifier[lang] = new natural.LogisticRegressionClassifier(this.stemmer[lang])
            this.answers[lang] = {}
            this.classifier[lang].withContext = {}
        }

        if (data.telegramToken) {
            this.telegramBot = new Telegraf(data.telegramToken, {
                username: data.name
            })
        }
    }


    destroy() {
        if (this.telegramBot) {
            this.telegramBot.stop()
        }
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
            this.createResult(ctx.message.text)
        }
        this.handleOn(key, ctx)
    }


    createResult(text) {
        this.result = {}
        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i],
                intend = this.findBestClassificationMatch(lang, text)

            if( !intend.value ){



            }

            let context = {}

            if (intend.value) {
                context = this.extractContext(lang, intend.label, text)
            }


            this.result[lang] = {
                intend: intend.label,
                intendValue: intend.value,
                context,
                answer: this.findAnswer(lang, intend.label, context)
            }
        }
    }

    extractContext(lang, key, text) {
        let finalContext = {}, bestDistance = 0
        const cls = this.classifier[lang]
        if (cls.withContext[key] && cls.withContext[key].length) {
            const textTokens = this.stemmer[lang].tokenizeAndStemFull(text)
            cls.withContext[key].forEach(expr => {
                const exprTokens = this.stemmer[lang].tokenizeAndStemFull(expr)

                if (textTokens.stemmed.length >= exprTokens.stemmed.length) {
                    let tmpContext = {}, totalDistance = 0, count = 0, currentKey, exprIdx = 0
                    for (let i = 0; i < textTokens.stemmed.length; i++) {
                        let pushit = false
                        if (exprTokens.stemmed[exprIdx].startsWith(Stemmer.CONTEXTSTART) && exprTokens.stemmed[exprIdx].endsWith(Stemmer.CONTEXTEND)) {
                            currentKey = exprTokens.stemmed[exprIdx].substring(Stemmer.CONTEXTSTART.length, exprTokens.stemmed[exprIdx].length - Stemmer.CONTEXTEND.length)
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


    enhanceAnswerWithContext(text, context) {

        if (context && Object.keys(context).length > 0 && text.indexOf('${') >= 0 && text.indexOf('}') > 0) {

            try {
                const result = new Function('const {' + Object.keys(context).join(',') + '} = this.context;return `' + text + '`').call({context})

                return result
            } catch (e) {
            }
        }
        return text
    }


    findAnswer(lang, key, context) {
        if (key && this.answers[lang] && this.answers[lang][key]) {
            const arr = this.answers[lang][key]
            const answer = arr[Math.floor(Math.random() * arr.length)]
            return this.enhanceAnswerWithContext(answer, context)
        }
    }

    findBestClassificationMatch(lang, text) {
        const classifier = this.classifier[lang]
        if (classifier.docs.length) {
            const result = classifier.getClassifications(text)
            console.log(text, result)
            if (result.length && result[0].value > this.threshold) {
                return result[0]
            }
        }
        return {label: '', value: 0}
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
                cls.withContext[key].push(expr.replace(/\${/g, Stemmer.CONTEXTSTART).replace(/}/g, Stemmer.CONTEXTEND))
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


    async handleOn(key, api) {
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
