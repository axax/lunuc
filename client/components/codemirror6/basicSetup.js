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
import {jsSnippets,cssSnippets} from './snippets'
import {formatCode,jumpToLine} from './utils'

const typeSpecific = type=>{
    console.log(`style for ${type}`)


    const customKeymap = keymap.of([
        { key: "Alt-Cmd-l", run: (view) => {
            formatCode(view, type)
            return true
        }},
        { key: "Alt-Cmd-g", run: jumpToLine }
    ])

    if(type==='css'){
        return [css(),cssSnippets(), customKeymap]
    } else if(type==='json'){
        return [json(), customKeymap]

    } else if(type==='html'){
        return [html()]
    }

    return [
        javascript(),
        jsSnippets()
    ]
}

const atCompletions = (config)=>{
    return (context) => {
        let word = context.matchBefore(/^@@.*$/)
        if (!word) return null
        if (word.from == word.to && !context.explicit) return null
        return {
            from: word.from,
            options: [
                {
                    label: word.text, type: 'ai completion', apply: (view, completion, from, to) => {
                        // Your custom logic here
                        console.log("Completion selected:", completion);
                        // Perform the default insertion

                        view.dispatch({
                            changes: {
                                from, // Start position of the line
                                to,     // End position of the line
                                insert: ''      // New text to insert
                            }
                        })

                        const contextInstructions = `the answer must be in plain ${config.type} code without code marker and instructions`
                        fetch(`/lunucapi/system/llm?stream=true&contextInstructions=${encodeURIComponent(contextInstructions)}&content=${encodeURIComponent(completion.label.substring(3))}`).then(async response => {
                            const reader = response.body.getReader()
                            let answer = ''
                            while (true) {
                                const chunk = await reader.read()
                                const answerPart = new TextDecoder().decode(chunk.value)
                                console.log(answerPart)
                                view.dispatch({
                                    changes: {
                                        from: from + answer.length, // Start position of the line
                                        insert: answerPart      // New text to insert
                                    },
                                    selection: {anchor: from + answer.length},
                                    scrollIntoView: true,
                                })
                                answer += answerPart

                                if (chunk.done) {
                                    break
                                }
                            }
                        })
                    }
                }
                // Add more options as needed
            ]
        }

    }
}

const basicSetup = (config={}) => {
    const customAutocomplete = atCompletions(config)
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
        ...typeSpecific(config.type),
        config.emptyLineGutter && emptyLineGutter,
        keywordDecorator,
        config.readOnly && EditorState.readOnly.of(true),
        EditorState.languageData.of(() => [{
            autocomplete: customAutocomplete
        }])
    ]
}

export {basicSetup}
