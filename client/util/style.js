/**
 * @function parseStyles
 * Parses a string of inline styles into a javascript object with casing for react
 *
 * @param {string} styles
 * @returns {Object}
 */
export const parseStyles = (styles) => {
    if(!styles){
        return {}
    }
    if(styles.constructor===Object){
        return styles
    }
    return styles
        .split(';')
        .map(style => {
            const parts = style.split(':')
            if(parts.length<2){
                return
            }
            const key = parts[0].trim()
            return [
                key.startsWith('--')?key:key.replace(/-./g, c => c.substr(1).toUpperCase()),
                parts[1].trim()
            ]
        })
        .reduce((styleObj, style) => {
            if(style){
                styleObj[style[0]] = style[1]
            }
            return styleObj
        }, {})
}

/*const st = new Date().getTime()
for(let i = 0; i< 1000000; i++) {
    parseStyles('color:green; --red:2; all:2323;background-color:blue;width:100px')
}
console.log((new Date().getTime() - st) + 'ms')*/