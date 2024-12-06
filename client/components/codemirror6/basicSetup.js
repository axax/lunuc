import {
    lineNumbers,
    highlightActiveLineGutter,
    highlightSpecialChars,
    drawSelection,
    dropCursor,
    rectangularSelection,
    crosshairCursor,
    highlightActiveLine,
    keymap
} from '@codemirror/view'
import {
    foldGutter,
    indentOnInput,
    syntaxHighlighting,
    defaultHighlightStyle,
    bracketMatching,
    foldKeymap
} from '@codemirror/language'
import {history, defaultKeymap, historyKeymap, indentWithTab} from '@codemirror/commands'
import {highlightSelectionMatches, searchKeymap} from '@codemirror/search'
import {closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap} from '@codemirror/autocomplete'
import {lintKeymap} from '@codemirror/lint'
import {EditorState} from "@codemirror/state"
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import {emptyLineGutter} from './emptyLineGutter'
import {keywordDecorator} from './keywordDecorator'
import {jsSnippets} from './snippets'

const customKeymap = keymap.of([
    { key: "Ctrl-s", run: (view) => {
            // Your save function here
            console.log("Saving...")
            return true
        }},
    { key: "Ctrl-f", run: (view) => {
            // Your find function here
            console.log("Finding...")
            return true
        }}
])

const typeSpecific = type=>{
    console.log(`style for ${type}`)

    if(type==='css'){
        return [css()]
    } else if(type==='json'){
        return [json()]
    } else if(type==='html'){
        return [html()]
    }

    return [
        javascript(),
        jsSnippets()
    ]
}

const basicSetup = (config={}) => {
    return [
        config.lineNumbers && lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            ...lintKeymap
        ]),
        /* custom */
        keymap.of([indentWithTab]),
        customKeymap,
        ...typeSpecific(config.type),
        config.emptyLineGutter && emptyLineGutter,
        keywordDecorator,
        config.readOnly && EditorState.readOnly.of(true)
    ]
}

export {basicSetup}
