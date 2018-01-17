import GenericResolver from 'api/resolver/generic/genericResolver'
import translate from 'google-translate-api'

export default db => ({
    translate: async ({text, toIso, fromIso}, {context}) => {
        if (!toIso) {
            toIso = 'en'
        }
        const res = (await translate(text, {to: toIso, from: fromIso}))
        return {text: res.text, fromIso: res.from.language.iso, toIso}
    },
    words: async ({sort, limit, offset, filter}, {context}) => {
        return await GenericResolver.entities(db, context, 'Word', ['en', 'de'], {limit, offset, filter, sort})
    },
    createWord: async ({en, de}, {context}) => {
        return await GenericResolver.createEnity(db, context, 'Word', {en, de})
    },
    updateWord: async ({_id, en, de}, {context}) => {
        return GenericResolver.updateEnity(db, context, 'Word', {_id, en, de})
    },
    deleteWord: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db, context, 'Word', {_id})
    }
})