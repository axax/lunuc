import natural from 'natural'
import Telegraf from 'telegraf'
import Stemmer from './Stemmer'
import stopwords_en from 'natural/lib/natural/util/stopwords'

class Bot {

    threshold = 0.8
    ons = {}
    stemmer = {}
    classifier = {}
    answers = {}
    withContext = {}
    exactMatch = {}
    telegramBot = false
    result = {}

    synonym = {
        de: {velo: 'fahrrad'},
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

    constructor(data) {
        this.data = data
        this.languages = data.languages.split(',')
        if (this.languages.length === 0) {
            this.languages.push('en')
        }
        for (let i = 0; i < this.languages.length; i++) {
            const lang = this.languages[i]
            this.stemmer[lang] = new Stemmer(this.stopwords[lang], this.charsToKeep[lang], this.synonym[lang])
            this.classifier[lang] = new natural.LogisticRegressionClassifier(this.stemmer[lang])
            this.answers[lang] = {}
            this.withContext[lang] = {}
            this.exactMatch[lang] = {}
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

            let intend
            const lang = this.languages[i]
            const textTokens = this.stemmer[lang].tokenizeAndStemFull(text)

            const extactMatch = this.getExactMatch(lang, textTokens)
            if (extactMatch) {
                intend = {label: extactMatch, value: 1}
            } else {
                intend = this.findBestClassificationMatch(lang, text)
            }

            let context = {}

            if (intend.value) {
                context = this.extractContext(lang, intend.label, textTokens)
            }


            this.result[lang] = {
                intend: intend.label,
                intendValue: intend.value,
                context,
                answer: this.findAnswer(lang, intend.label, context)
            }
        }
    }

    extractContext(lang, key, textTokens) {
        let finalContext = {}, bestDistance = 0

        if (this.withContext[lang][key] && this.withContext[lang][key].length) {
            this.withContext[lang][key].forEach(exprTokens => {

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
                            tmpContext[currentKey] = tmpContext[currentKey + 'List'].join(' ')
                            tmpContext[currentKey + 'Stemmed'] = tmpContext[currentKey + 'StemmedList'].join(' ')
                        }

                        exprIdx++
                        if (exprIdx >= exprTokens.stemmed.length) {
                            exprIdx = exprTokens.stemmed.length - 1
                        }
                    }
                    const avgDistance = totalDistance / count

                    if (avgDistance > 0.9 && avgDistance > bestDistance) {
                        bestDistance = avgDistance
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
            if (result.length && result[0].value > this.threshold) {
                return result[0]
            }
        }
        return {label: '', value: 0}

    }

    getExactMatch(lang, textTokens) {
        return this.exactMatch[lang][textTokens.stemmed.join('')]
    }


    addExpression(lang, expressions, key) {
        if (expressions.constructor !== Array) {
            expressions = [expressions]
        }
        expressions.forEach(expr => {
            const cls = this.classifier[lang]


            if (expr.indexOf('${') >= 0 && expr.indexOf('}') >= 0) {
                if (!this.withContext[lang][key]) {
                    this.withContext[lang][key] = []
                }
                const exprTokens = this.stemmer[lang].tokenizeAndStemFull(expr.replace(/\${/g, Stemmer.CONTEXTSTART).replace(/}/g, Stemmer.CONTEXTEND), true)

                this.withContext[lang][key].push(exprTokens)
                this.classifier[lang].addDocument(expr.replace(/\$\{[A-z0-9_]*?\}/g, ''), key)
            } else {
                const exprTokens = this.stemmer[lang].tokenizeAndStemFull(expr, true)

                const match = exprTokens.stemmed.join('')

                this.exactMatch[lang][match] = key

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

export default Bot