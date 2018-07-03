import React from 'react'
import PropTypes from 'prop-types'
import UploadUtil from 'client/util/upload'

import {convertToRaw, convertFromRaw, convertFromHTML, ContentState, EditorState, RichUtils} from 'draft-js'

import Editor, {composeDecorators} from 'draft-js-plugins-editor'
import createLinkifyPlugin from 'draft-js-linkify-plugin'
import createImagePlugin from 'draft-js-image-plugin'
import createBlockDndPlugin from 'draft-js-drag-n-drop-plugin'
import createFocusPlugin from 'draft-js-focus-plugin'


import ImageAdd from './ImageAdd';

/*import createImagePlugin from 'draft-js-image-plugin'
 import createAlignmentPlugin from 'draft-js-alignment-plugin'
 import createFocusPlugin from 'draft-js-focus-plugin'
 import createResizeablePlugin from 'draft-js-resizeable-plugin'
 import createBlockDndPlugin from 'draft-js-drag-n-drop-plugin'*/
//import createDragNDropUploadPlugin from 'draft-js-drag-n-drop-upload-plugin'

const focusPlugin = createFocusPlugin()
const blockDndPlugin = createBlockDndPlugin()

const decorator = composeDecorators(
    focusPlugin.decorator,
    blockDndPlugin.decorator
)
const imagePlugin = createImagePlugin({decorator})

const linkifyPlugin = createLinkifyPlugin()

const plugins = [focusPlugin, blockDndPlugin, linkifyPlugin, imagePlugin]

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

        this.onChange = (editorState, forceSave) => {
            this.setState({editorState})
            if (forceSave || this.state.editorState.getCurrentContent() !== editorState.getCurrentContent()) {

                console.log('state changed')
                clearTimeout(this.changeTimeout)
                this.changeTimeout = setTimeout(this.onChangeDelayed, 5000)

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

        const {readOnly} = this.props
        const {editorState} = this.state


        const editorProps = {
            readOnly,
            plugins,
            editorState,
            placeholder: 'Tell a story...',
            ref: (editor) => {
                this.editor = editor
            },
            onChange: this.onChange
        }

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
                    editorState={editorState}
                    onToggle={this.toggleBlockType}
                    onChange={this.onChange}
                />
                <InlineStyleControls
                    editorState={editorState}
                    onToggle={this.toggleInlineStyle}
                />
                <div className={className} onClick={this.focus} onDrop={this.handleDrop.bind(this)}>
                    <Editor {...editorProps}/>
                </div>
            </div>
        }
        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content
    }


    componentWillReceiveProps(nextProps) {
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

    handleDrop(e) {
        const files = e.target.files || e.dataTransfer.files
        const uploadTo = '/graphql/upload'

        const {validFiles, invalidFiles} = UploadUtil.validateFiles({
            files,
            accept: 'image/*',
            maxFileSize: 10 * 1024 * 1024
        })

        if (invalidFiles.length) {
            // TODO implement proper error handling
            alert(invalidFiles[0].message)
        } else {

            for (let i = 0, file; file = validFiles[i]; i++) {
                const isImage = UploadUtil.isImage(file.name)

                if (isImage) {
                    UploadUtil.resizeImageFromFile({
                        file,
                        maxWidth: 1000,
                        maxHeight: 100,
                        quality: 0.6,
                        onSuccess: (dataUrl) => {
                            this.uploadData(dataUrl, file, uploadTo)
                        }
                    })
                } else {
                    this.uploadData(URL.createObjectURL(file), file, uploadTo)
                }
            }
        }

        console.log(files)
    }

    uploadData(dataUrl, file, uploadTo) {
        UploadUtil.uploadData({
            dataUrl,
            fileName: file.name,
            uploadTo,
            onProgress: () => {
                // TODO implement progress bar
            },
            onLoad: (e) => {
                const {status, message, ids} = e.target.response
                if (status === 'success') {
                    if (ids && ids.length) {

                        const {editorState} = this.state

                        this.onChange(imagePlugin.addImage(editorState, '/uploads/' + ids[0]), true)
                    }

                } else {
                    // TODO implement proper error handling
                }
            },
            onError: (e) => {
                // TODO implement proper error handling
            }
        })
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
}


PostEditor
    .propTypes = {
    onChange: PropTypes.func,
    post: PropTypes.object.isRequired,
    readOnly: PropTypes.bool
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
    const {editorState, onChange} = props
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

            <ImageAdd
                editorState={editorState}
                onChange={onChange}
                modifier={imagePlugin.addImage}
            />

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