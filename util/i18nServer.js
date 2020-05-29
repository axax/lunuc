//import translations from 'gensrc/tr'
import config from 'gen/config'
const {DEFAULT_LANGUAGE} = config
const translations={}

const _t = function (key, lang=DEFAULT_LANGUAGE, replacements) {
    const tr = translations[lang]
    let str
    if (tr && tr[key]) {
        str = tr[key]
        if (replacements) {
            str = str.replace(/%(\w+)%/g, (all, k) => {
                return replacements[k] !== undefined ? replacements[k] : all
            })
        }
    } else {
        str = key
    }

    return str
}

export default _t
