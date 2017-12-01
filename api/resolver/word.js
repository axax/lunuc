import GenericResolver from './genericResolver'
import translate from 'google-translate-api'


export const wordResolver = (db) => ({
    translate: async ({text, toIso, fromIso}, {context}) => {
        if (!toIso) {
            toIso = 'en'
        }
        const res = (await translate(text, {to: toIso, from: fromIso}))
        return {text: res.text, fromIso: res.from.language.iso, toIso}
    },
    words: async ({limit, offset}, {context}) => {
        return await GenericResolver.entities(db,context,'Word',['en','de'],{limit, offset})
    },
    createWord: async ({en, de}, {context}) => {
        return await GenericResolver.createEnity(db,context,'Word',{en,de})
    },
    updateWord: async ({_id, en, de}, {context}) => {
        return GenericResolver.updateEnity(db,context,'Word',{_id,en,de})
    },
    deleteWord: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db,context,'Word',{_id})
    }
})