import natural from 'natural'
import Telegraf from 'telegraf'


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
        de: ['ist', 'der', 'die', 'das', 'es']
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
            this.classifier[lang].withContext = []
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
                    if (ctx.message && ctx.message.text) {
                        this.createNlpResult(ctx.message.text)
                    }
                    this.handleOn(key, ctx)
                })
            })
            this.telegramBot.launch()
        }
    }

    createNlpResult(text) {
        this.result = {}
        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i],
                intend = this.bestClassifierIntend(lang, text),
                context = this.getConversationContext(lang, text)
            this.result[lang] = {intend, context, answer: this.findAnswer(lang, intend, context)}
        }
    }

    getConversationContext(lang, text) {
        let finalContext = {}
        if (this.classifier[lang].withContext.length) {
            const textTokens = this.tokenizeAndStem(lang, text)
            this.classifier[lang].withContext.forEach(expr => {

                const exprTokens = this.tokenizeAndStem(lang, expr)
                if (textTokens.length === exprTokens.length) {
                    let tmpContext = {}
                    for (let i = 0; i < textTokens.length; i++) {
                        if (textTokens[i] === exprTokens[i]) {
                            continue
                        } else if (exprTokens[i].startsWith(Bot.CONTEXTSTART) && exprTokens[i].endsWith(Bot.CONTEXTEND)) {
                            let key = exprTokens[i].substring(Bot.CONTEXTSTART.length, exprTokens[i].length - Bot.CONTEXTEND.length)
                            tmpContext[key] = textTokens[i]
                        } else {
                            tmpContext = {}
                            break
                        }

                    }
                    finalContext = {...finalContext, ...tmpContext}
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
            }catch(e){}
        }
        return text
    }

    tokenizeAndStem(lang, text) {
        var tokenizer = new natural.RegexpTokenizer({pattern: /[^A-Za-zА-Яа-я0-9_]+/});

        var stemmedTokens = []
        var lowercaseText = text.toLowerCase()
        var tokens = tokenizer.tokenize(lowercaseText)


        tokens.forEach(token => {
            if (token.startsWith(Bot.CONTEXTSTART) === 0 && token.endsWith(Bot.CONTEXTEND)) {
                stemmedTokens.push(token)
            } else if (this.stopwords[lang].indexOf(token) == -1)
                stemmedTokens.push(natural.PorterStemmer.stem(token))
        })

        return stemmedTokens

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
            console.log(result)
            if (result.length && result[0].value > this.threshold) {
                return result[0].label
            }
        }
    }

    async handleOn(key, api) {
        const arr = this.ons[key]
        for (let i = 0; i < arr.length; i++) {
            const res = await arr[i]({api, ...this.result})
            if (res) {
                return res
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
            this.classifier[lang].addDocument(expr, key)
            if (expr.indexOf('${') >= 0 && expr.indexOf('}') >= 0) {
                this.classifier[lang].withContext.push(expr.replace(/\${/g, Bot.CONTEXTSTART).replace(/}/g, Bot.CONTEXTEND))
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
        if( keys.constructor !== Array){
            keys = [keys]
        }
        keys.forEach(key=> {
            if (!this.ons[key]) {
                this.ons[key] = []
            }
            this.ons[key].push(cb)
        })
    }

}

export default Bot