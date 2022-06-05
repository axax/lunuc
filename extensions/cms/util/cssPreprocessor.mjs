/*
 A very basic css preprocessor (support for nested css)
 */


export const preprocessCss = (ncss, sub) => {

    if(!_app_.ssr &&  ncss instanceof MessageEvent){
        // if it is called directly from a web worker
        ncss = ncss.data
    }

    const flattenRules = (tokens) => {
        function addRules(rules, selectors, styles) {
            rules.push([selectors, styles])
            const get = () => tokens.shift()
            let atRule = null
            let ll
            for (let token = get(); token; token = get()) {
                //console.log(token)
                if ( /^@/.test(token)) {
                    atRule = '';
                    ll = 0;
                }
                if (atRule !== null) {
                    if (token !== ';') atRule += ' '
                    atRule += token
                    if (token === '{') ++ll
                    if ((token === '}' && --ll === 0) || (token === ';' && ll === 0)) {
                        const parts = /^([^{]+){([\s\S]*)}$/.exec(atRule)
                        if (parts && /^\s*@(media|supports|document)/.test(parts[0])) atRule = parts[1] + '{' + preprocessCss(parts[2], true).replace(/\n/g, ' ') + ' }'
                        rules.push([[], [atRule.replace(/ *\n */g, ' ')]])
                        atRule = null
                    }
                } else if (token === '}') break; else if (tokens[0] === '{') { // next token is {
                    get(); // skip {
                    let deeperSelectors = []
                    token.split(/\s*,\s*/).forEach(tsel => selectors.forEach(sel =>
                        deeperSelectors.push(
                            tsel.indexOf('&') >= 0 ? tsel.replace(/^(.*?)\s*&/, (_, prefix) => prefix ? prefix + ' ' + sel.trim() : sel) : sel + ' ' + tsel
                        )
                    ))
                    addRules(rules, deeperSelectors, [])
                } else
                    styles.push(token)
            }
            return rules
        }

        const result = addRules([], [''], [])
            .filter(a => a[1][0])
            .map(a => a[0] + (a[0][0] ? ` { ${a[1].join(' ')} }` : a[1].join('\n')).replace(/ ;/g, ';'))
            .join('\n')
        return result
    }

    let startTime
    if(!sub) {
        startTime = new Date()
    }
    const tokens = []
    const quotes = []
    const quoteToken = ':Q=' + (Math.random() + '=Q:').substr(2)

    ncss
        .replace(/(['"])(.*?[^\\])?\1|\([^)]+:\/\/[^)]+\)/g, q => quoteToken + quotes.push(q)) // store and remove quotes
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') // remove remarks
        .replace(/([\s\S]*?)\s*([;{}]|$)/g, (_, g1, g2) => tokens.push.apply(tokens, [g1, g2].map(s => s.trim()).filter(s => s))) // tokenize

    const result = flattenRules(tokens)
        .replace(/[ \n]*\n */g, '\n')
        .replace(new RegExp(quoteToken + '(\\d+)', 'g'), (_, n) => quotes[n - 1]) // restore quotes

    if( !sub ) {
        console.log(`css preprocessed in ${new Date() - startTime}ms`)
    }

    /*startTime = new Date()
    let newSelector
    for(let i = 0;i < ncss.length;i++){

        let c = ncss.charAt(i)
        if(c==='{'){
            newSelector = true
        }else if(c==='}') {
            newSelector = false
        }

    }
    console.log(`css preprocessed in ${new Date() - startTime}ms`)*/

    return result

}
