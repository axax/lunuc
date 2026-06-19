// RegexpTokenizer ist ein NAMED export
import { RegexpTokenizer } from 'natural/lib/natural/tokenizers/regexp_tokenizer.js'
// LancasterStemmer ist (in den meisten Versionen) eine fertige Instanz als default export
import LancasterStemmer from 'natural/lib/natural/stemmers/lancaster_stemmer.js'

class Stemmer {

    static CONTEXTSTART = '__contextstart__'
    static CONTEXTEND = '__contextend__'

    stopwords = []
    charsToKeep = {}
    synonym = {}
    cache = {}

    constructor(stopwords, charsToKeep, synonym) {
        if (stopwords)
            this.stopwords = stopwords
        if (charsToKeep)
            this.charsToKeep = charsToKeep
        if (synonym)
            this.synonym = synonym
    }


    tokenizeAndStem(text, keepStops) {
        const result = this.tokenizeAndStemFull(text, keepStops)
        return keepStops ? result.stemmedWithoutContext : result.stemmedCleaned
    }

    tokenizeAndStemFull(text, cache) {
        if (this.cache[text]) {
            return this.cache[text]
        }


        let finalTokens = {
            hasContext: false,
            stemmed: [], /* stemmed values including context placeholders */
            original: [], /* original value icluding context placeholders */
            stemmedWithoutContext: [], /* stemmed values without context placeholders */
            stemmedCleaned: [] /* stemmed values without context placeholders and stopwords */
        }


        // keep placeholders
        if (text.indexOf('${') >= 0 && text.indexOf('}') >= 0) {
            finalTokens.hasContext = true
            text = text.replace(/\${/g, Stemmer.CONTEXTSTART).replace(/}/g, Stemmer.CONTEXTEND)
        }
        let tokenizer = new RegexpTokenizer({pattern: new RegExp('[^A-Za-z0-9_\-' + Object.keys(this.charsToKeep).join('') + ']+')});
        let tokens = tokenizer.tokenize(text)


        tokens.forEach(token => {
            let tokenLowerCase = token.replace(new RegExp('[' + Object.keys(this.charsToKeep).join('|') + ']', "g"),
                (a) => this.charsToKeep[a]
            ).toLowerCase()
            if (this.synonym[tokenLowerCase]) {
                tokenLowerCase = this.synonym[tokenLowerCase]
            }
            if (tokenLowerCase.startsWith(Stemmer.CONTEXTSTART) && tokenLowerCase.endsWith(Stemmer.CONTEXTEND)) {
                finalTokens.stemmed.push(tokenLowerCase)
                finalTokens.original.push(token)
            } else {
                const stemmed = LancasterStemmer.stem(tokenLowerCase)
                finalTokens.stemmed.push(stemmed)
                finalTokens.original.push(token)

                finalTokens.stemmedWithoutContext.push(stemmed)
                if (this.stopwords.indexOf(tokenLowerCase) == -1) {
                    finalTokens.stemmedCleaned.push(stemmed)
                }
            }
        })
        if (cache) {
            this.cache[text] = finalTokens
        }
        return finalTokens
    }


}

export default Stemmer
