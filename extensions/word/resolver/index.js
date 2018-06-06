import translate from 'google-translate-api'

export default db => ({
    translate: async ({text, toIso, fromIso}, {context}) => {
        if (!toIso) {
            toIso = 'en'
        }
        const res = (await translate(text, {to: toIso, from: fromIso}))
        return {text: res.text, fromIso: res.from.language.iso, toIso}
    }
})