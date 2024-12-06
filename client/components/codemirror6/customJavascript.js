import { javascriptLanguage } from '@codemirror/lang-javascript'
import { styleTags, tags as t } from '@codemirror/highlight'
import { LRLanguage } from '@codemirror/language'

export const customJavascript = LRLanguage.define({
    parser: javascriptLanguage.parser.configure({
        props: [
            styleTags({
                DomUtil: t.keyword, // Highlight 'myCustomFunction' as a keyword
            }),
        ],
    }),
    languageData: javascriptLanguage.data,
})