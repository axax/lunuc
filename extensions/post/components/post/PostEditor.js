import React from 'react'
import PropTypes from 'prop-types'
import {Editor, convertToRaw, convertFromRaw, convertFromHTML, ContentState, EditorState, RichUtils} from 'draft-js'

import './PostEditor.css'

export default class PostEditor extends React.Component {
    constructor(props) {
        super(props)

        this._currentRawData = this.props.post.body

        this.state = {
            isHover: false,
            editorState: this._getEditorState(this.props.post.body)
        }

        this.focus = () => this.editor.focus()

        this.changeTimeout = false

        this.onChange = (editorState) => {
            this.setState({editorState})

            if (this.state.editorState.getCurrentContent() !== editorState.getCurrentContent()) {
                console.log('state changed')
                clearTimeout(this.changeTimeout)
                this.changeTimeout = setTimeout(this.onChangeDelayed,5000)

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


    componentWillReceiveProps(nextProps) {
        if (nextProps.post ){
            if( this.props.post._id !== nextProps.post._id){
                if( this.changeTimeout ) {
                    clearTimeout(this.changeTimeout)
                    this.onChangeDelayed()
                }
            }

            if( this._currentRawData != nextProps.post.body ) {
                const contentState = this.state.editorState.getCurrentContent()
                this.setState({editorState: this._getEditorState(nextProps.post.body)})
                this._currentRawData = nextProps.post.body
            }
        }
    }


    _getEditorState(bodyRaw) {
        console.log('get editor state')
        if (bodyRaw && bodyRaw != '') {
            var parsedContent
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

    render() {

        const {editorState} = this.state

        // If the user changes block type before entering any text, we can
        // either style the placeholder or hide it. Let's just hide it now.
        let className = 'RichEditor-editor'
        var contentState = editorState.getCurrentContent()
        if (!contentState.hasText()) {
            if (contentState.getBlockMap().first().getType() !== 'unstyled') {
                className += ' RichEditor-hidePlaceholder'
            }
        }


        return <div className="RichEditor-root">
            <BlockStyleControls
                editorState={editorState}
                onToggle={this.toggleBlockType}
            />
            <InlineStyleControls
                editorState={editorState}
                onToggle={this.toggleInlineStyle}
            />
            <div className={className} onClick={this.focus}
                 onDragOver={this.handelDragOver.bind(this)}>
                <Editor
                    blockStyleFn={getBlockStyle}
                    customStyleMap={styleMap}
                    editorState={editorState}
                    handleKeyCommand={this.handleKeyCommand}
                    onChange={this.onChange}
                    onTab={this.onTab}
                    placeholder="Tell a story..."
                    spellCheck={true}
                    ref={(editor) => {
                        this.editor = editor
                    }}
                ></Editor>
            </div>
        </div>

    }
}


PostEditor.propTypes = {
    onChange: PropTypes.func,
    post: PropTypes.object.isRequired
}


// Custom overrides for "code" style.
const styleMap = {
    CODE: {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
        fontSize: 16,
        padding: 2
    }
}

function getBlockStyle(block) {
    switch (block.getType()) {
        case 'blockquote':
            return 'RichEditor-blockquote'
        default:
            return null
    }
}

class StyleButton extends React.Component {
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
    const {editorState} = props
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