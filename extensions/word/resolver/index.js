import {Translate} from '@google-cloud/translate'

export default db => ({
    Query: {
        translate: async ({text, toIso, fromIso}, {context}) => {
            if (!toIso) {
                toIso = 'en'
            }
            const translator = new Translate({
                key: process.env.GOOGLE_API_KEY,
            })


            let [translation] = await translator.translate(text, toIso)

            return {text: translation, fromIso, toIso}
        }
    }
})
