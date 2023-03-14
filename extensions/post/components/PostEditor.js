import {useEffect} from 'react'
import React from 'react'
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import ExampleTheme from "./themes/ExampleTheme"
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS } from "@lexical/markdown";

import TreeViewPlugin from "./plugins/TreeViewPlugin.js";
import ToolbarPlugin from "./plugins/ToolbarPlugin.js";
import ListMaxIndentLevelPlugin from "./plugins/ListMaxIndentLevelPlugin.js";
import CodeHighlightPlugin from "./plugins/CodeHighlightPlugin.js";
import AutoLinkPlugin from "./plugins/AutoLinkPlugin.js";

import './PostEditor.css'


function Placeholder() {
    return <div className="editor-placeholder">Enter some rich text...</div>;
}

const editorConfig = {
    // The editor theme
    theme: ExampleTheme,
    // Handling of errors during update
    onError(error) {
        throw error;
    },
    // Any custom nodes go here
    nodes: [
        HeadingNode,
        ListNode,
        ListItemNode,
        QuoteNode,
        CodeNode,
        CodeHighlightNode,
        TableNode,
        TableCellNode,
        TableRowNode,
        AutoLinkNode,
        LinkNode
    ]
}

function RestorePlugin({ post, readOnly }){
    const [editor] = useLexicalComposerContext()
    useEffect(() => {
        if (post && editor ) {
            const initialEditorState = editor.parseEditorState(JSON.parse(post.body))
            editor.setEditorState(initialEditorState)
        }
    }, [post, editor, readOnly])

    return <></>
}

export default React.memo((props) => {

    const {post, onChange, debug} = props
    return (
        <LexicalComposer ref={(ref)=>{
            /*const node = ReactDOM.findDOMNode(ref)
            node.ref = ref*/
        }} initialConfig={editorConfig}>
            <div className="editor-container">
                <ToolbarPlugin />
                <div className="editor-inner">
                    <RestorePlugin post={post} readOnly={false} />
                    <RichTextPlugin

                        contentEditable={<ContentEditable className="editor-input" />}
                        placeholder={<Placeholder />}
                    />
                    <HistoryPlugin />
                    {debug && <TreeViewPlugin />}
                    <AutoFocusPlugin />
                    <CodeHighlightPlugin />
                    <ListPlugin />
                    <LinkPlugin />
                    <AutoLinkPlugin />
                    <ListMaxIndentLevelPlugin maxDepth={7} />
                    <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                    <OnChangePlugin ignoreSelectionChange={true} ignoreHistoryMergeTagChange={true} onChange={(editorState, x)=>{

                        //  console.log(JSON.stringify(editorState.toJSON()), post.body)
                        onChange(editorState.toJSON())
                    }} />
                </div>
            </div>
        </LexicalComposer>
    )
}, (prevProps, nextProps) => {

    return prevProps.post.id === nextProps.post.id
})
