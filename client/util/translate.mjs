import {client} from '../middleware/graphql.js'
import Util from './index.mjs'

export const translateText = ({text, toIso, fromIso}) => {
    return new Promise((resolve)=>{
        client.query({
            fetchPolicy: 'no-cache',
            query: 'query translate($text: String!, $toIso: String!){translate(text: $text, toIso: $toIso){text toIso}}',
            variables: {
                text: text.replace(/\\n/g, '\n').replace(/%(\w+)%/g, '@_$1_'),
                toIso,
                fromIso
            },
        }).then((res) => {
            // double escape
            const newText = Util.escapeForJson(Util.escapeForJson(res.data.translate.text.replace(/@_(\w+)_/g, '%$1%').replace(/\\/g, '')))
            resolve({text:newText, toIso: res.data.translate.toIso})
        })
    })
}


