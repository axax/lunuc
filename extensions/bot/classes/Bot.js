import natural from 'natural'
import Telegraf from 'telegraf'
import Stemmer from './Stemmer'
import stopwords_en from 'natural/lib/natural/util/stopwords'
import ImageClassifier from '../util/imageClassifier'


class Bot {

    minAccuracy = 0.7
    ons = {}
    context = {}
    stemmer = {}
    classifier = {}
    answers = {}
    expressions = {}
    commands = {}
    telegramBot = false
    result = {}
    settings = {telegramChats: []}//[437556760,  -297061732, -356386664]
    db = null

    synonym = {
        de: {velo: 'fahrrad', 'roboter': 'bot'},
        en: {u: 'you'}
    }
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

    constructor(data, db) {
        this.data = data
        try {
            const settings = JSON.parse(data.settings)
            this.settings = settings
        } catch (e) {
            console.warn(`Bot settings invalid ${data.settings}`, e)
        }
        this.db = db
        this.languages = data.languages.split(',')
        if (this.languages.length === 0) {
            this.languages.push('en')
        }
        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i]
            this.stemmer[lang] = new Stemmer(this.stopwords[lang], this.charsToKeep[lang], this.synonym[lang])
            this.classifier[lang] = new natural.LogisticRegressionClassifier(this.stemmer[lang])
            this.answers[lang] = {}
            this.expressions[lang] = []
        }

        if (data.telegramToken) {
            this.telegramBot = new Telegraf(data.telegramToken, {
                username: data.name
            })
        }
    }

    destroy() {
        clearInterval(this.interval)
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

            Object.keys(this.commands).forEach(key => {
                this.telegramBot.command(key, (ctx) => {
                    this.addTelegramChat(ctx)
                    this.commands[key].bind(this)({api: ctx})
                })
            })

            Object.keys(this.ons).forEach(key => {
                this.telegramBot.on(key, ctx => {
                    this.addTelegramChat(ctx)
                    this.communicate(key, ctx)
                })
            })


            /*this.telegramBot.start((ctx) => {
             this.addTelegramChat(ctx)
             ctx.reply('Welcome')
             })*/
            this.telegramBot.launch()
        }

        this.interval = setInterval(this.checkStatus.bind(this), 10000)
    }

    getTelegramChat(id) {
        for (let i = 0; i < this.settings.telegramChats.length; i++) {
            const chat = this.settings.telegramChats[i]
            if (chat.id === id) {
                return chat
            }
        }
        return null
    }


    addTelegramChat(ctx) {
        let id = ctx.chat.id
        let chat = this.getTelegramChat(id)
        let lastActive = (new Date()).getTime()
        if (!chat) {
            this.settings.telegramChats.push({id, lastActive})
        } else {
            chat.lastActive = lastActive
        }
        this.saveSettings()
    }

    saveSettings() {
        this.db.collection('Bot').updateOne({_id: this.data._id}, {$set: {settings: JSON.stringify(this.settings)}})
    }

    checkStatus() {
        this.handleOn('checkStatus')
    }


    communicate(key, ctx) {
        if (ctx.message && ctx.message.text) {
            this.archiveMessage(ctx)
            let command = ctx.message.text.trim().toLowerCase()

            if (command.startsWith('/') && this.commands[command.substring(1)]) {
                // its a command
                this.commands[command.substring(1)].bind(this)({api: ctx})
                return
            } else {

                this.createResult(ctx.message.text)
            }
        }
        this.handleOn(key, ctx)
    }


    archiveMessage(context){
        const insertResult = this.db.collection('BotConversation').insertOne({
            context: JSON.stringify(context),
            bot: this.data._id
        })
    }


    createResult(text) {
        const startTime = new Date()
        let bestMatch = {key: '', lang: '', context: {}}, highestAccuracy = 0
        this.result = {}
        for (let i = 0; i < this.languages.length; i++) {

            const lang = this.languages[i]
            const textTokens = this.stemmer[lang].tokenizeAndStemFull(text)

            // 1. check if there is a match
            let match = this.findBestMatch(lang, textTokens)

            // 2. add answer if there is a match
            if (match.key) {
                match.answer = this.findAnswer(lang, match.key, match.context)
            }

            if (match.accuracy > highestAccuracy) {
                highestAccuracy = match.accuracy
                bestMatch = match
            }
        }
        console.log(`Time to createResult ${new Date() - startTime}ms`)
        this.result.bestMatch = bestMatch
    }


    findBestClassificationMatch(lang, text) {
        const classifier = this.classifier[lang]
        if (classifier.docs.length) {
            const result = classifier.getClassifications(text)
            if (result.length > 0) {
                for (const match of result) {
                    if (match.value > this.threshold) {
                        /* const opts = this.expressionOptions[match.label]
                         if (opts) {
                         const tokens = this.stemmer[lang].tokenizeAndStem(expr)
                         if (exprTokens.length > opts.maxWords) {
                         continue
                         }
                         }*/
                        return result[0]
                    } else {
                        break
                    }
                }
            }
        }
        return {label: '', value: 0}
    }


    findBestMatch(lang, tokens) {
        const expressions = this.expressions[lang]
        let highestAccuracy = 0, bestMatch
        if (expressions.length > 0) {
            for (const expression of expressions) {
                const options = expression.options
                let match = {key: expression.key, lang}

                if (expression.tokens.hasContext) {
                    const x = this.matchExpressionWithContext(expression.tokens, tokens, options)
                    match.accuracy = x.accuracy
                    match.context = x.context
                } else {
                    match.accuracy = this.compareTwoStrings(tokens.stemmedWithoutContext.join(''), expression.match)
                }

                if (match.accuracy > 0) {

                    if (options && options.minAccuracy) {
                        // if it is not accurate enough skip it
                        if (options.minAccuracy > match.accuracy) {
                            continue
                        }
                    } else if (this.minAccuracy > match.accuracy) {
                        continue
                    }

                    if (match.accuracy > highestAccuracy) {
                        highestAccuracy = match.accuracy
                        bestMatch = match
                        if (highestAccuracy === 1) {
                            break
                        }
                    }
                }
            }
        }

        if (bestMatch) {
            return bestMatch
        }

        return {key: '', accuracy: 0, lang}
    }


    matchExpressionWithContext(exprTokens, textTokens, options) {
        let result = {accuracy: 0, context: {}}

        if (textTokens.stemmed.length >= exprTokens.stemmed.length) {
            let tmpContext = {}, totalAccuracy = 0, count = 0, currentKey, exprIdx = -1
            for (let i = 0; i < textTokens.stemmed.length; i++) {
                exprIdx++
                if (exprIdx >= exprTokens.stemmed.length) {
                    exprIdx = exprTokens.stemmed.length - 1
                }

                let pushit = false
                if (exprTokens.stemmed[exprIdx].startsWith(Stemmer.CONTEXTSTART) && exprTokens.stemmed[exprIdx].endsWith(Stemmer.CONTEXTEND)) {
                    currentKey = exprTokens.stemmed[exprIdx].substring(Stemmer.CONTEXTSTART.length, exprTokens.stemmed[exprIdx].length - Stemmer.CONTEXTEND.length)
                    if (!tmpContext[currentKey + 'List']) {
                        tmpContext[currentKey + 'List'] = []
                        tmpContext[currentKey + 'StemmedList'] = []
                    }
                    pushit = true
                } else {
                    const accuracy = natural.JaroWinklerDistance(textTokens.stemmed[i], exprTokens.stemmed[exprIdx])

                    if (accuracy < 0.65 && currentKey) {
                        // it is probably a part of the context
                        pushit = true
                        exprIdx--
                    } else {
                        currentKey = ''
                        totalAccuracy += accuracy
                        count++
                    }

                }

                if (pushit) {
                    if(options && options.maxContextParts && tmpContext[currentKey + 'List'].length > options.maxContextParts-1 ){

                        // context is too long
                        totalAccuracy += 0.65
                        count++
                    }else {
                        tmpContext[currentKey + 'List'].push(textTokens.original[i])
                        tmpContext[currentKey + 'StemmedList'].push(textTokens.stemmed[i])
                        tmpContext[currentKey] = tmpContext[currentKey + 'List'].join(' ')
                        tmpContext[currentKey + 'Stemmed'] = tmpContext[currentKey + 'StemmedList'].join(' ')
                    }
                }
            }

            // if there are more words at the end of the matched express add to count
            count += exprTokens.stemmed.length - 1 - exprIdx

            result.accuracy = totalAccuracy / count
            result.context = tmpContext
            result.exprIdx = exprIdx
        }

        /*if (result.accuracy > .80) {
            console.log(exprTokens.stemmed, textTokens.stemmed)
            console.log(result, options)
            console.log( exprTokens.stemmed.length)

        }*/
        return result
    }

    compareTwoStrings(first, second) {
        if (!first.length && !second.length) return 1                   // if both are empty strings
        if (!first.length || !second.length) return 0                   // if only one is empty string
        if (first === second) return 1       							 // identical
        if (first.length === 1 && second.length === 1) return 0         // both are 1-letter strings
        if (first.length < 2 || second.length < 2) return 0			 // if either is a 1-letter string

        let firstBigrams = new Map()
        for (let i = 0; i < first.length - 1; i++) {
            const bigram = first.substr(i, 2)
            const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1

            firstBigrams.set(bigram, count)
        }

        let intersectionSize = 0;
        for (let i = 0; i < second.length - 1; i++) {
            const bigram = second.substr(i, 2)
            const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0

            if (count > 0) {
                firstBigrams.set(bigram, count - 1)
                intersectionSize++
            }
        }

        return (2.0 * intersectionSize) / (first.length + second.length - 2)
    }

    addExpression(lang, expressions, key, options) {
        if (expressions.constructor !== Array) {
            expressions = [expressions]
        }
        expressions.forEach(expr => {
            const tokens = this.stemmer[lang].tokenizeAndStemFull(expr)

            if (tokens.stemmedWithoutContext.length > 0) {
                this.expressions[lang].push({key, tokens, match: tokens.stemmedWithoutContext.join(''), options})
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

    addContext(context) {
        this.context = {...this.context, ...context}
    }

    addCommand(keys, callback) {
        if (keys.constructor !== Array) {
            keys = [keys]
        }
        for (const key of keys) {
            this.commands[key.trim().toLowerCase()] = callback
        }
    }

    enhanceAnswerWithContext(text, context) {
        const allContext = {...this.context, ...context}
        if (allContext && Object.keys(allContext).length > 0 && text.indexOf('${') >= 0 && text.indexOf('}') > 0) {

            try {
                const result = new Function('const {' + Object.keys(allContext).join(',') + '} = this.context;return `' + text + '`').call({context: allContext})

                return result
            } catch (e) {
                console.log(e)
                console.log(text, allContext)
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


    async handleOn(key, api) {
        const arr = this.ons[key]
        if (arr) {
            for (let i = 0; i < arr.length; i++) {
                const res = await
                    arr[i]({api, ...this.result, bot: this, telegram: this.telegramBot.telegram})
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
        const botCommands = (await
                db.collection('BotCommand').find({bot: this.data._id, active: true}).sort({order: 1}).toArray()
        )

        botCommands.forEach(async botCommand => {
            if (botCommand.script) {
                const tpl = new Function(`
                 (async () => {
                    try {
                        const bot = this.bot
                        const on = this.bot.on.bind(this.bot)
                        const addExpression = this.bot.addExpression.bind(this.bot)
                        const addAnswer = this.bot.addAnswer.bind(this.bot)
                        const findAnswer = this.bot.findAnswer.bind(this.bot)
                        const addContext = this.bot.addContext.bind(this.bot)
                        const addCommand = this.bot.addCommand.bind(this.bot)
                        const natural = this.bot.natural
                        const require = this.require
                        const ImageClassifier = this.ImageClassifier
                        ${botCommand.script}
                    } catch(e) {
                        console.log('Error in ${botCommand.name}', e);
                    }
                })();
                `)

                const result = await tpl.call({
                    bot: this,
                    require,
                    ImageClassifier,
                })
            }
        })
    }

}

export default Bot
