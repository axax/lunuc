import apiTranslations from '../api/translations/translations'
import config from 'gen/config'
const {DEFAULT_LANGUAGE} = config


export const translations = {}

export const _t = function (key, lang=DEFAULT_LANGUAGE, replacements) {
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

export const registerTrs = (trans) => {
    Object.keys(trans).forEach(lang =>{
        translations[lang] = {...translations[lang],...trans[lang]}
    })
}
registerTrs(apiTranslations)
