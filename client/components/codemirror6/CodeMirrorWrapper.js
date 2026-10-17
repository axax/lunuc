import React, { useRef, useEffect, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from '@mui/material/styles'
import { EditorState, Annotation } from "@codemirror/state"
import {basicSetup} from './basicSetup'
import {scrollToLine} from './utils'
import './style.css'
import {MergeView} from '@codemirror/merge'
import {linter, lintGutter} from '@codemirror/lint'


// marks transactions that were dispatched programmatically, so the update
// listener can tell them apart from real user input
const externalUpdate = Annotation.define()


const CodeMirrorWrapper = (props) => {
    const {controlled, mergeView, darkMode, onFirstVisibleLineChange, onEditorView, onContextMenu, style, onChange, onBlur, type, lineNumbers, identifier, value, mergeValue, readOnly, onToggleAiAssistent, lint} = props
    const editor = useRef()
    const editorViewRef = useRef()
    const muiTheme = useTheme()
    // dark mode follows the active admin theme unless it is set explicitly
    const isDark = darkMode !== undefined ? !!darkMode : muiTheme?.palette?.mode === 'dark'
    const editorBackground = isDark ? (muiTheme?.palette?.background?.paper || '#282c34') : '#ffffff'

    // only called when the editor is (re)created - not on every render (every keystroke re-renders this component)
    const createThemeOption = () => EditorView.theme({

        '&': {
            height: '30rem',
            backgroundColor: editorBackground,
            ...style
        },
        '& .cm-scroller': {
            height: '100% !important',
        },
        ...(isDark && {
            '& .cm-gutters': {
                backgroundColor: editorBackground,
                borderRight: '1px solid ' + (muiTheme?.palette?.divider || '#3b4048')
            }
        })
    }, {dark: isDark})

    useEffect(() => {
        // the merge view has no top level state, so it is not supported here
        if (!controlled || mergeView) {
            return
        }
        const view = editorViewRef.current
        if (!view || view.state.doc.toString() === value) {
            return
        }

        // keep the cursor where it was, but never outside the new document
        const oldPos = Math.min(view.state.selection.main.head, (value || '').length)
        const scrollTop = view.scrollDOM.scrollTop

        view.dispatch({
            changes: {from: 0, to: view.state.doc.length, insert: value},
            selection: {anchor: oldPos, head: oldPos},
            annotations: externalUpdate.of(true)
        })

        requestAnimationFrame(() => {
            view.scrollDOM.scrollTop = scrollTop
        })
    }, [value, controlled])

    useEffect(() => {
        // the scroll handler reads the layout - at most once per frame
        let scrollFrame = 0
        const extensions = [createThemeOption(),
            ...basicSetup({type,lineNumbers,readOnly,onToggleAiAssistent}),
            isDark && oneDark,
            onFirstVisibleLineChange && EditorView.domEventHandlers({
                scroll: (scollEvent, view) => {
                    if (scrollFrame) {
                        return
                    }
                    scrollFrame = requestAnimationFrame(() => {
                        scrollFrame = 0
                        const newFistVisibleLine = view.state.doc.lineAt(view.elementAtHeight(view.dom.getBoundingClientRect().top - view.documentTop).from).number
                        if(props.firstVisibleLine !== newFistVisibleLine){
                            props.firstVisibleLine=newFistVisibleLine
                            onFirstVisibleLineChange(props.firstVisibleLine)
                        }
                    })
                },
                contextmenu:(clickEvent, view)=>{
                    if(onContextMenu){
                        onContextMenu(clickEvent, view)
                    }
                },
                blur: (event)=>{
                    if(onBlur){
                        onBlur(event, view)
                    }
                }
            }),
            onChange && EditorView.updateListener.of((update) => {
                // ignore changes that this component dispatched itself
                if(update.docChanged && !update.transactions.some(tr => tr.annotation(externalUpdate))) {
                    const codeAsString = update.state.doc.toString()
                    onChange(codeAsString)
                }
            }),
            // optional warnings: lint(text) returns [{from, to, severity, message}]
            // the linter runs debounced after the user stopped typing, never on the initial render path
            lint && linter(view => lint(view.state.doc.toString()), {delay: 750}),
            lint && lintGutter()].filter(ex => !!ex)

        let view
        if(mergeView){
            view = new MergeView({
                a: {doc: value,extensions},
                b: {doc: mergeValue, extensions: [...extensions,EditorView.editable.of(false),EditorState.readOnly.of(true)]},
                parent: editor.current,
                collapseUnchanged: { margin: 3, minSize: 3 },
                highlightChanges:true,
                mergeScroll: true,
                revertControls:'a-to-b'
            })
        }else {
            view = new EditorView({state: EditorState.create({doc:value,extensions}), parent: editor.current})
        }
        editorViewRef.current = view
        if (onEditorView) {
            onEditorView(view)
        }

        scrollToLine(view, props.firstVisibleLine)
        return () => {
            if (scrollFrame) {
                cancelAnimationFrame(scrollFrame)
            }
            view.destroy()
        }
    }, [identifier, isDark])

    if(mergeView){
        return <><div style={{display:'flex',width:'100%'}}>
            <div style={{flex:1}}>Old Version</div>
            <div style={{flex:1}}>Your Version</div>
        </div>
            <div ref={editor}></div></>
    }else{
        return <div ref={editor}></div>
    }


}

export default CodeMirrorWrapper