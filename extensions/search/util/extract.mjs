import {LANGUAGES, DEFAULT_LANGUAGE, ANY_LANGUAGE, textLanguage} from './config.mjs'

const getPath = (obj, path) => String(path).split('.').reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], obj)

// words of an entry for the prefix search (index on SearchIndex.words), same splitting as the search terms
export const MAX_WORDS = 2000
export const MAX_WORD_LENGTH = 40
export const toWords = (text) => {
    const words = new Set()
    for (const word of String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        if (word.length >= 2) {
            words.add(word.substring(0, MAX_WORD_LENGTH))
            if (words.size >= MAX_WORDS) break
        }
    }
    return [...words]
}

const clean = (text) => String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()

// plain values only: references (ObjectId) and other objects are not indexed
const toText = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(' ')
    return ''
}

const isLocalizedValue = (value) => {
    if (!value || value.constructor !== Object) return false
    const keys = Object.keys(value).filter(k => k !== '__typename')
    return keys.length > 0 && keys.every(k => LANGUAGES.includes(k))
}

// {lang: text} for a localized value, {[ANY_LANGUAGE]: text} for a plain value
const textByLanguage = (value) => {
    const result = {}
    if (isLocalizedValue(value)) {
        for (const lang of LANGUAGES) {
            const text = clean(toText(value[lang]))
            if (text) result[lang] = text
        }
    } else {
        const text = clean(toText(value))
        if (text) result[ANY_LANGUAGE] = text
    }
    return result
}

/**
 * Builds the SearchIndex entries of one document: one entry per language of its localized values,
 * or a single entry (lang "*") if no value is localized. Plain values are part of every entry.
 *
 * The text index and the substring search use title and parts.t (no extra field with the whole text).
 * maxTextLength limits the text of all parts together.
 *
 * @returns [{lang, language, title, words, parts: [{f, t}]}]
 */
export const buildEntries = ({source, titleFields = [], fieldNames = [], fieldPaths = {}, maxTextLength = 20000}) => {
    const perField = []
    const languages = new Set()
    for (const name of [...new Set([...titleFields, ...fieldNames])]) {
        const byLang = textByLanguage(getPath(source, fieldPaths[name] || name))
        if (Object.keys(byLang).length > 0) {
            perField.push({name, byLang})
            Object.keys(byLang).forEach(lang => lang !== ANY_LANGUAGE && languages.add(lang))
        }
    }
    if (perField.length === 0) {
        return []
    }
    const entryLanguages = languages.size > 0 ? [...languages] : [ANY_LANGUAGE]

    return entryLanguages.map(lang => {
        const parts = []
        for (const {name, byLang} of perField) {
            const text = byLang[lang] ?? byLang[ANY_LANGUAGE]
            if (text) parts.push({f: name, t: text})
        }
        const titlePart = titleFields.map(f => parts.find(p => p.f === f)).filter(Boolean)
        // limit of all parts together (in the order of the fields, title fields first)
        const limitedParts = []
        let remaining = maxTextLength
        for (const part of parts) {
            if (remaining <= 0) break
            const t = part.t.substring(0, remaining)
            limitedParts.push({f: part.f, t})
            remaining -= t.length
        }
        return {
            lang,
            // field used by the text index (language_override): stemming of this entry
            language: textLanguage(lang === ANY_LANGUAGE ? DEFAULT_LANGUAGE : lang),
            title: titlePart.map(p => p.t).join(' ').substring(0, 300),
            words: toWords(titlePart.map(p => p.t).join(' ') + ' ' + limitedParts.map(p => p.t).join(' ')),
            parts: limitedParts
        }
    })
}
