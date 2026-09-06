import {speechLanguages, translateLanguages} from '../data/common.mjs'

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2'

export const commonResolver = (db) => ({
    Query: {
        speechLanguages: (data, {context}) => {
            return {data: speechLanguages, selection: null}
        },
        translateLanguages: (data, {context}) => {
            return {data: translateLanguages, selection: null}
        },
        translate: async ({text, toIso, fromIso}, {context}) => {
            if (!toIso) {
                toIso = 'en'
            }

            const payload = {q: text, target: toIso, format: 'text'}
            if (fromIso) {
                payload.source = fromIso
            }

            const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${process.env.GOOGLE_API_KEY}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                throw new Error(`Google Translate failed (${response.status}): ${await response.text()}`)
            }

            const {data} = await response.json()
            const translation = data.translations[0]

            return {
                text: translation.translatedText,
                fromIso: fromIso || translation.detectedSourceLanguage,
                toIso
            }
        }
    }
})