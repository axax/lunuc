import React from 'react'
import PropTypes from 'prop-types'
import './PostEditor.css'
import 'draft-js-focus-plugin/lib/plugin.css'

import {convertToRaw, convertFromRaw, convertFromHTML, ContentState, EditorState, RichUtils} from 'draft-js'

import Editor, {composeDecorators} from 'draft-js-plugins-editor'
import createLinkifyPlugin from 'draft-js-linkify-plugin'
import createImagePlugin from 'draft-js-image-plugin'
import createBlockDndPlugin from 'draft-js-drag-n-drop-plugin'
import createFocusPlugin from 'draft-js-focus-plugin'
import createDndFileUploadPlugin from './dnd-upload-plugin'


import ImageAdd from './ImageAdd';

/*import createImagePlugin from 'draft-js-image-plugin'
 import createAlignmentPlugin from 'draft-js-alignment-plugin'
 import createFocusPlugin from 'draft-js-focus-plugin'
 import createResizeablePlugin from 'draft-js-resizeable-plugin'
 import createBlockDndPlugin from 'draft-js-drag-n-drop-plugin'*/

export default class PostEditor extends React.Component {
    constructor(props) {
        super(props)

        this.plugins = []
        const {readOnly, imageUpload} = props

        let decorator = null
        if (!readOnly) {
            const focusPlugin = createFocusPlugin({})
            const blockDndPlugin = createBlockDndPlugin()

            decorator = composeDecorators(
                focusPlugin.decorator,
                blockDndPlugin.decorator
            )

            this.plugins.push(focusPlugin, blockDndPlugin)
        }
        this.imagePlugin = createImagePlugin({decorator})
        const linkifyPlugin = createLinkifyPlugin()
        this.plugins.push(linkifyPlugin, this.imagePlugin)

        if (!readOnly && imageUpload) {
            const dndFileUploadPlugin = createDndFileUploadPlugin({
                handleUpload: true,
                addImage: this.imagePlugin.addImage
            })
            this.plugins.push(dndFileUploadPlugin)
        }


        this._currentRawData = this.props.post.body

        this.state = {
            isHover: false,
            editorState: this._getEditorState(this.props.post.body)
        }

        this.focus = () => this.editor.focus()

        this.changeTimeout = false

        this.onChange = (editorState, editor, forceSave) => {
            if (this.props.readOnly) return
            this.setState({editorState})
            if (forceSave || this.state.editorState.getCurrentContent() !== editorState.getCurrentContent()) {
                clearTimeout(this.changeTimeout)
                this.changeTimeout = setTimeout(this.onChangeDelayed, 500)

            }
        }

        this.onChangeDelayed = () => {
            this.changeTimeout = false
            const contentState = this.state.editorState.getCurrentContent()
            const rawContentJson = convertToRaw(contentState)
            const rawContent = JSON.stringify(rawContentJson)
            this._currentRawData = rawContent

            this.props.onChange(rawContent)
        }

        this.handleKeyCommand = (command) => this._handleKeyCommand(command)
        this.onTab = (e) => this._onTab(e)
        this.toggleBlockType = (type) => this._toggleBlockType(type)
        this.toggleInlineStyle = (style) => this._toggleInlineStyle(style)
    }


    render() {
        const startTime = new Date()

        const {readOnly, imageUpload} = this.props
        const {editorState} = this.state


        const editorProps = {
            readOnly,
            plugins: this.plugins,
            editorState,
            placeholder: 'Tell a story...',
            ref: (editor) => {
                this.editor = editor
            },
            onChange: this.onChange,
            blockRendererFn: this.blockRendererFn
        }

        /*editorProps.blockRenderMap = {
            unstyled: {
                element: 'div',
                aliasedElements: ['p']
            }
        }*/

        let content
        if (readOnly) {
            content = <Editor {...editorProps}/>
        } else {
            editorProps.blockStyleFn = getBlockStyle
            editorProps.customStyleMap = styleMap
            editorProps.handleKeyCommand = this.handleKeyCommand
            editorProps.onTab = this.onTab
            editorProps.spellCheck = true


            // If the user changes block type before entering any text, we can
            // either style the placeholder or hide it. Let's just hide it now.
            let className = 'RichEditor-editor'
            var contentState = editorState.getCurrentContent()
            if (!contentState.hasText()) {
                if (contentState.getBlockMap().first().getType() !== 'unstyled') {
                    className += ' RichEditor-hidePlaceholder'
                }
            }

            content = <div className="RichEditor-root">
                <BlockStyleControls
                    imageUpload={imageUpload}
                    editorState={editorState}
                    onToggle={this.toggleBlockType}
                    onChange={this.onChange}
                    imagePlugin={this.imagePlugin}
                />
                <InlineStyleControls
                    editorState={editorState}
                    onToggle={this.toggleInlineStyle}
                />
                <div className={className} onClick={this.focus}>
                    <Editor {...editorProps}/>
                </div>
            </div>
        }
        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content
    }


    UNSAFE_componentWillReceiveProps(nextProps) {
        if (nextProps.post) {
            if (this.props.post._id !== nextProps.post._id) {
                if (this.changeTimeout) {
                    clearTimeout(this.changeTimeout)
                    this.onChangeDelayed()
                }
            }

            if (this._currentRawData != nextProps.post.body) {
                const contentState = this.state.editorState.getCurrentContent()
                this.setState({editorState: this._getEditorState(nextProps.post.body)})
                this._currentRawData = nextProps.post.body
            }
        }
    }


    blockRendererFn = (block) => {

        const {readOnly} = this.props
        if (readOnly && block.type === 'unstyled') {
            return {
                component: () => <p>{block.text}</p>
            }
        }
        const {editorState} = this.state
        const entityKey = block.getEntityAt(0)
        if (!entityKey) {
            return
        }

        const entity = editorState.getCurrentContent().getEntity(entityKey)
        if (entity.getType() !== 'IMAGE') {
            return
        }

        const {height, src, width} = entity.getData()
        // don't render block text; it's still in content state though
        return {
            component: () => (<img
                height={height}
                src={src}
                width={width}
            />)
        }
    }

    _getEditorState(bodyRaw) {
        if (bodyRaw && bodyRaw != '') {
            let parsedContent
            try {
                parsedContent = convertFromRaw(JSON.parse(bodyRaw))
            } catch (e) {
                console.warn('Can not convert body', e)
                const blocksFromHTML = convertFromHTML(bodyRaw)
                parsedContent = ContentState.createFromBlockArray(
                    blocksFromHTML.contentBlocks,
                    blocksFromHTML.entityMap
                )
            }
            return EditorState.createWithContent(parsedContent)
        } else {
            return EditorState.createEmpty()
        }
    }

    _handleKeyCommand(command) {
        const {editorState} = this.state
        const newState = RichUtils.handleKeyCommand(editorState, command)
        if (newState) {
            this.onChange(newState)
            return true
        }
        return false
    }

    _onTab(e) {
        const maxDepth = 4
        this.onChange(RichUtils.onTab(e, this.state.editorState, maxDepth))
    }

    _toggleBlockType(blockType) {
        this.onChange(
            RichUtils.toggleBlockType(
                this.state.editorState,
                blockType
            )
        )
    }

    _toggleInlineStyle(inlineStyle) {
        this.onChange(
            RichUtils.toggleInlineStyle(
                this.state.editorState,
                inlineStyle
            )
        )
    }

    setDragState(e, isHover) {
        e.preventDefault()
        e.stopPropagation()
        this.setState({isHover})
    }

    handelDragOver(e) {
        this.setDragState(e, true)
    }
}


PostEditor.propTypes = {
    onChange: PropTypes.func,
    post: PropTypes.object.isRequired,
    readOnly: PropTypes.bool,
    imageUpload: PropTypes.bool
}


// Custom overrides for "code" style.
const
    styleMap = {
        CODE: {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
            fontSize: 16,
            padding: 2
        }
    }

function

getBlockStyle(block) {
    switch (block.getType()) {
        case 'blockquote':
            return 'RichEditor-blockquote'
        default:
            return null
    }
}

class StyleButton
    extends React
        .Component {
    constructor() {
        super()
        this.onToggle = (e) => {
            e.preventDefault()
            this.props.onToggle(this.props.style)
        }
    }

    render() {
        let className = 'RichEditor-styleButton'
        if (this.props.active) {
            className += ' RichEditor-activeButton'
        }

        return (
            <span className={className} onMouseDown={this.onToggle}>
              {this.props.label}
            </span>
        )
    }
}

const BLOCK_TYPES = [
    {label: 'H1', style: 'header-one'},
    {label: 'H2', style: 'header-two'},
    {label: 'H3', style: 'header-three'},
    {label: 'H4', style: 'header-four'},
    {label: 'H5', style: 'header-five'},
    {label: 'H6', style: 'header-six'},
    {label: 'Blockquote', style: 'blockquote'},
    {label: 'UL', style: 'unordered-list-item'},
    {label: 'OL', style: 'ordered-list-item'},
    {label: 'Code Block', style: 'code-block'}
]

const BlockStyleControls = (props) => {
    const {editorState, onChange, imagePlugin, imageUpload} = props
    const selection = editorState.getSelection()
    const blockType = editorState
        .getCurrentContent()
        .getBlockForKey(selection.getStartKey())
        .getType()

    return (
        <div className="RichEditor-controls">
            {BLOCK_TYPES.map((type) =>
                <StyleButton
                    key={type.label}
                    active={type.style === blockType}
                    label={type.label}
                    onToggle={props.onToggle}
                    style={type.style}
                />
            )}

            {imageUpload && <ImageAdd
                editorState={editorState}
                onChange={onChange}
                modifier={imagePlugin.addImage}
            />}

        </div>
    )
}


BlockStyleControls.propTypes = {
    editorState: PropTypes.object
}


var INLINE_STYLES = [
    {label: 'Bold', style: 'BOLD'},
    {label: 'Italic', style: 'ITALIC'},
    {label: 'Underline', style: 'UNDERLINE'},
    {label: 'Monospace', style: 'CODE'}
]

const InlineStyleControls = (props) => {
    var currentStyle = props.editorState.getCurrentInlineStyle()
    return (
        <div className="RichEditor-controls">
            {INLINE_STYLES.map(type =>
                <StyleButton
                    key={type.label}
                    active={currentStyle.has(type.style)}
                    label={type.label}
                    onToggle={props.onToggle}
                    style={type.style}
                />
            )}
        </div>
    )
}

InlineStyleControls.propTypes = {
    editorState: PropTypes.object
}
