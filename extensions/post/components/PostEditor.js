import React from 'react'
import {LexicalComposer} from '@lexical/react/LexicalComposer'
import {RichTextPlugin} from '@lexical/react/LexicalRichTextPlugin'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {AutoFocusPlugin} from '@lexical/react/LexicalAutoFocusPlugin'
import {LinkPlugin} from '@lexical/react/LexicalLinkPlugin'
import {ClickableLinkPlugin} from '@lexical/react/LexicalClickableLinkPlugin'
import {ListPlugin} from '@lexical/react/LexicalListPlugin'
import {CheckListPlugin} from '@lexical/react/LexicalCheckListPlugin'
import {TablePlugin} from '@lexical/react/LexicalTablePlugin'
import {TabIndentationPlugin} from '@lexical/react/LexicalTabIndentationPlugin'
import {HorizontalRulePlugin} from '@lexical/react/LexicalHorizontalRulePlugin'
import {HorizontalRuleNode} from '@lexical/react/LexicalHorizontalRuleNode'
import {MarkdownShortcutPlugin} from '@lexical/react/LexicalMarkdownShortcutPlugin'
import {HeadingNode, QuoteNode} from '@lexical/rich-text'
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table'
import {ListItemNode, ListNode} from '@lexical/list'
import {CodeHighlightNode, CodeNode} from '@lexical/code-core'
import {AutoLinkNode, LinkNode} from '@lexical/link'
import {_t, registerTrs} from 'util/i18n.mjs'
import {translations} from '../translations/admin.js'

import ExampleTheme from './themes/ExampleTheme'
import {ImageNode} from './nodes/ImageNode.js'
import {EXTENDED_TRANSFORMERS} from './utils/markdownTransformers.js'
import TreeViewPlugin from './plugins/TreeViewPlugin.js'
import ToolbarPlugin from './plugins/ToolbarPlugin.js'
import ListMaxIndentLevelPlugin from './plugins/ListMaxIndentLevelPlugin.js'
import CodeHighlightPlugin from './plugins/CodeHighlightPlugin.js'
import AutoLinkPlugin from './plugins/AutoLinkPlugin.js'
import ImagesPlugin from './plugins/ImagesPlugin.js'
import EditorApiPlugin from './plugins/EditorApiPlugin.js'
import UserChangePlugin from './plugins/UserChangePlugin.js'

import './PostEditor.css'

// Übersetzungen auch im Frontend (PostRenderer) verfügbar machen
registerTrs(translations, 'Post')

const EDITOR_NODES = [
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
    LinkNode,
    HorizontalRuleNode,
    ImageNode
]

/**
 * Initialen Inhalt aus dem gespeicherten body bestimmen.
 * Ungültige oder leere Inhalte (z.B. alte draftjs-Daten) ergeben einen leeren Editor statt eines Absturzes.
 */
const initialEditorState = (body) => {
    if (!body) {
        return undefined
    }
    try {
        const json = body.constructor === String ? JSON.parse(body) : body
        if (json && json.root && json.root.children && json.root.children.length > 0) {
            return JSON.stringify(json)
        }
    } catch (e) {
        console.warn('PostEditor: could not parse body', e)
    }
    return undefined
}

const PostEditor = (props) => {

    const {post, onChange, debug, onReady, onStats, onImageError, placeholder, mediaGroup} = props
    const editable = !!onChange && !props.readOnly
    const containerRef = React.useRef(null)
    const interactionRef = React.useRef(null)

    return (
        <LexicalComposer key={post._id} initialConfig={{
            namespace: 'PostEditor',
            theme: ExampleTheme,
            nodes: EDITOR_NODES,
            editable,
            editorState: initialEditorState(post.body),
            onError(error) {
                console.error(error)
            }
        }}>
            <div ref={containerRef} className={'editor-container' + (editable ? '' : ' read-only')}>
                {editable && <ToolbarPlugin/>}
                <div className="editor-inner">
                    <RichTextPlugin
                        contentEditable={<ContentEditable className="editor-input"/>}
                        placeholder={editable ? <div className="editor-placeholder">{placeholder || _t('Post.placeholder')}</div> : null}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin/>
                    {debug && <TreeViewPlugin/>}
                    {editable && <AutoFocusPlugin defaultSelection="rootEnd"/>}
                    <CodeHighlightPlugin/>
                    <ListPlugin/>
                    <CheckListPlugin/>
                    <LinkPlugin/>
                    <ClickableLinkPlugin/>
                    <AutoLinkPlugin/>
                    <TablePlugin hasCellMerge={true} hasCellBackgroundColor={false} hasHorizontalScroll={true}/>
                    <HorizontalRulePlugin/>
                    <ImagesPlugin onError={onImageError} mediaGroup={mediaGroup}/>
                    {editable && <TabIndentationPlugin/>}
                    <ListMaxIndentLevelPlugin maxDepth={7}/>
                    {editable && <MarkdownShortcutPlugin transformers={EXTENDED_TRANSFORMERS}/>}
                    {(onReady || onStats) &&
                    <EditorApiPlugin onReady={onReady} onStats={onStats} interactionRef={interactionRef}/>}
                    {onChange && <UserChangePlugin onChange={onChange} containerRef={containerRef}
                                                   interactionRef={interactionRef}/>}
                </div>
            </div>
        </LexicalComposer>
    )
}

export default React.memo(PostEditor, (prevProps, nextProps) => {
    return prevProps.post && nextProps.post &&
        prevProps.post._id === nextProps.post._id &&
        prevProps.identifier === nextProps.identifier
})
