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
        .filter(style => style.split(':')[0] && style.split(':')[1])
        .map(style => [
            style.split(':')[0].trim().replace(/-./g, c => c.substr(1).toUpperCase()),
            style.split(':')[1].trim()
        ])
        .reduce((styleObj, style) => ({
            ...styleObj,
            [style[0]]: style[1],
        }), {})
}
