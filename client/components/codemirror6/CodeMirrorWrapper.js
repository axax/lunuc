import React, { useRef, useEffect, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from "@codemirror/state"
import {basicSetup} from './basicSetup'
import {scrollToLine} from './utils'
import './style.css'
import {MergeView} from '@codemirror/merge'



const CodeMirrorWrapper = (props) => {
    const {controlled, mergeView, darkMode, onFirstVisibleLineChange, onEditorView, onContextMenu, style, onChange, onBlur, type, lineNumbers, identifier, value, mergeValue, readOnly} = props
    const editor = useRef()
    const editorViewRef = useRef()

    const defaultThemeOption = EditorView.theme({

        '&': {
            height: '30rem',
            backgroundColor: '#ffffff',
            ...style
        },
        '& .cm-scroller': {
            height: '100% !important',
        },
    })

    if (controlled){
        React.useEffect(() => {
            if(editorViewRef.current && editorViewRef.current.state.doc.toString() !== value) {
                const view = editorViewRef.current
                const oldPos = view.state.selection.main.head
                const scrollInfo = view.scrollDOM.scrollTop;  // or view.scrollDOM.getBoundingClientRect()


                view._lastUpdate = Date.now()
                view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: value },
                    selection: { anchor: oldPos, head: oldPos }  // Retains cursor; adjust pos if needed (e.g., value.length for end)
                })
                requestAnimationFrame(() => {
                    view.scrollDOM.scrollTop = scrollInfo;
                    // OR for more precision: view.scrollTo(null, scrollInfo);
                });
            }
        }, [value])
    }

    useEffect(() => {
        const extensions = [defaultThemeOption,
            ...basicSetup({type,lineNumbers,readOnly}),
            darkMode && oneDark,
            onFirstVisibleLineChange && EditorView.domEventHandlers({
                scroll: (scollEvent, view) => {
                    const newFistVisibleLine = view.state.doc.lineAt(view.elementAtHeight(view.dom.getBoundingClientRect().top - view.documentTop).from).number
                    if(props.firstVisibleLine !== newFistVisibleLine){
                        props.firstVisibleLine=newFistVisibleLine
                        onFirstVisibleLineChange(props.firstVisibleLine)
                    }
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
            onChange && EditorView.updateListener.of((view) => {
                // prevent endless changes
                if(view.docChanged && (!editorViewRef.current._lastUpdate || (Date.now() - editorViewRef.current._lastUpdate) > 100)) {
                    const codeAsString = view.state.doc.toString()
                    onChange(codeAsString)
                }
            })].filter(ex => !!ex)

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
            view.destroy()
        }
    }, [identifier])

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