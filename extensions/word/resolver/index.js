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
    words: async ({sort, limit, offset, page, filter}, {context}) => {
        return await GenericResolver.entities(db, context, 'Word', ['en', 'de'], {limit, offset, page, filter, sort})
    },
    createWord: async (data, {context}) => {
        return await GenericResolver.createEnity(db, context, 'Word', data)
    },
    updateWord: async ({_id, ...rest}, {context}) => {
        return GenericResolver.updateEnity(db, context, 'Word', {_id, ...rest})
    },
    deleteWord: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db, context, 'Word', {_id})
    }
})