import {Translate} from '@google-cloud/translate'

const GOOGLE_API_KEY = 'AIzaSyCGrDAmX6xhoBXMGbi0c3bQ8_0nxr2DbZo';


export default db => ({
    Query: {
        translate: async ({text, toIso, fromIso}, {context}) => {
            if (!toIso) {
                toIso = 'en'
            }
            const translator = new Translate({
                key: GOOGLE_API_KEY,
            })


            let [translation] = await translator.translate(text, toIso)

            return {text: translation, fromIso, toIso}
        }
    }
})