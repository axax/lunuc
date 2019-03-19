
import natural from 'natural'


class Stemmer {

    static CONTEXTSTART = '__contextstart__'
    static CONTEXTEND = '__contextend__'

    stopwords = []
    charsToKeep = {}

    constructor(stopwords, charsToKeep){
        if( stopwords )
            this.stopwords = stopwords
        if(charsToKeep )
            this.charsToKeep = charsToKeep
    }



    tokenizeAndStem(text, keepStops) {
        return this.tokenizeAndStemFull(text,keepStops).stemmed
    }

    tokenizeAndStemFull(text, keepStops) {
        var tokenizer = new natural.RegexpTokenizer({pattern: new RegExp('[^A-Za-zА-Яа-я0-9_' + Object.keys(this.charsToKeep).join() + ']+')});

        var finalTokens = {stemmed: [], original: []}
        var tokens = tokenizer.tokenize(text)


        tokens.forEach(token => {
            const tokenLowerCase = token.replace(new RegExp('[' + Object.keys(this.charsToKeep).join('|') + ']', "g"),
                (a) => this.charsToKeep[a]
            ).toLowerCase()
            if (tokenLowerCase.startsWith(Stemmer.CONTEXTSTART) === 0 && tokenLowerCase.endsWith(Stemmer.CONTEXTEND)) {
                finalTokens.stemmed.push(tokenLowerCase)
                finalTokens.original.push(token)
            } else if (keepStops || this.stopwords.indexOf(tokenLowerCase) == -1) {
                finalTokens.stemmed.push(natural.LancasterStemmer.stem(tokenLowerCase))
                finalTokens.original.push(token)
            }
        })
        //console.log(finalTokens)
        return finalTokens
    }



}

export default Stemmer