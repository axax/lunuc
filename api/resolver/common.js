import {speechLanguages, translateLanguages} from '../data/common'
import {v2} from '@google-cloud/translate'


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
            const translator = new v2.Translate({
                key: process.env.GOOGLE_API_KEY,
            })


            let [translation] = await translator.translate(text, toIso)

            return {text: translation, fromIso, toIso}
        }
    }
})
