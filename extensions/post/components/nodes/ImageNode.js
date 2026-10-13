import React, {useCallback, useEffect, useRef, useState} from 'react'
import {
    $applyNodeReplacement,
    $getNodeByKey,
    $getSelection,
    $isNodeSelection,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    DecoratorNode,
    KEY_BACKSPACE_COMMAND,
    KEY_DELETE_COMMAND,
    KEY_ESCAPE_COMMAND
} from 'lexical'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection'
import {mergeRegister} from '@lexical/utils'
import {_t} from 'util/i18n.mjs'

const WIDTH_PRESETS = ['25%', '50%', '75%', '100%']
const ALIGNMENTS = ['left', 'center', 'right']

/**
 * Bild-Komponente, die im Editor gerendert wird.
 * Zeigt bei Auswahl eine kleine Toolbar (Breite, Ausrichtung, Alt-Text, Bildunterschrift, Löschen)
 */
function ImageComponent({src, altText, width, align, caption, nodeKey, uploading}) {
    const [editor] = useLexicalComposerContext()
    const imageRef = useRef(null)
    const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
    const [isResizing, setIsResizing] = useState(false)
    const [hasError, setHasError] = useState(false)
    const editable = editor.isEditable()

    const updateNode = useCallback((fn) => {
        editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if ($isImageNode(node)) {
                fn(node)
            }
        })
    }, [editor, nodeKey])

    const onDelete = useCallback((event) => {
        if (isSelected && $isNodeSelection($getSelection())) {
            event.preventDefault()
            const node = $getNodeByKey(nodeKey)
            if ($isImageNode(node)) {
                node.remove()
                return true
            }
        }
        return false
    }, [isSelected, nodeKey])

    useEffect(() => {
        if (!editable) {
            return
        }
        return mergeRegister(
            editor.registerCommand(CLICK_COMMAND, (event) => {
                if (isResizing) {
                    return true
                }
                if (event.target === imageRef.current) {
                    if (!event.shiftKey) {
                        clearSelection()
                    }
                    setSelected(!isSelected)
                    return true
                }
                return false
            }, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
            editor.registerCommand(KEY_ESCAPE_COMMAND, () => {
                if (isSelected) {
                    clearSelection()
                    return true
                }
                return false
            }, COMMAND_PRIORITY_LOW)
        )
    }, [editor, editable, isSelected, isResizing, onDelete, clearSelection, setSelected])

    // Breite per Ziehen am rechten Rand ändern
    const onResizeStart = (event) => {
        event.preventDefault()
        event.stopPropagation()
        const img = imageRef.current
        const container = img && img.closest('.editor-input')
        if (!img || !container) {
            return
        }
        const startX = event.clientX
        const startWidth = img.getBoundingClientRect().width
        const maxWidth = container.getBoundingClientRect().width - 20
        setIsResizing(true)

        const onMove = (e) => {
            const newWidth = Math.max(50, Math.min(maxWidth, startWidth + (e.clientX - startX)))
            img.style.width = `${Math.round(newWidth)}px`
        }
        const onUp = () => {
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', onUp)
            const finalWidth = Math.round(img.getBoundingClientRect().width)
            const percent = Math.min(100, Math.round(finalWidth * 100 / maxWidth))
            updateNode(node => node.setWidth(`${percent}%`))
            // Klick nach dem Resizing nicht als Auswahl werten
            setTimeout(() => setIsResizing(false), 50)
        }
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
    }

    const showControls = editable && isSelected && !uploading

    return <figure className={`editor-image-figure align-${align || 'center'}${isSelected ? ' selected' : ''}`}
                   style={{width: width || 'auto'}}>
        <div className="editor-image-wrapper">
            {src && !hasError ?
                <img ref={imageRef}
                     src={src}
                     alt={altText || ''}
                     draggable={false}
                     className={`editor-image${uploading ? ' uploading' : ''}`}
                     onError={() => setHasError(true)}/> :
                <div ref={imageRef} className="editor-image-placeholder">
                    {uploading ? _t('Post.imageUploading') : _t('Post.imageMissing')}
                </div>}
            {uploading && <div className="editor-image-progress"><span/></div>}
            {showControls && <span className="editor-image-resizer" onPointerDown={onResizeStart}
                                   title={_t('Post.imageResize')}/>}
        </div>
        {(caption || showControls) &&
        <figcaption>
            {showControls ?
                <input className="editor-image-caption-input"
                       placeholder={_t('Post.imageCaption')}
                       defaultValue={caption || ''}
                       onKeyDown={e => e.stopPropagation()}
                       onBlur={e => {
                           const v = e.target.value
                           updateNode(node => node.setCaption(v))
                       }}/> : caption}
        </figcaption>}
        {showControls &&
        <div className="editor-image-toolbar" onMouseDown={e => {
            // Fokus im Input-Feld erlauben, sonst Auswahl im Editor behalten
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault()
            }
        }}>
            {WIDTH_PRESETS.map(w =>
                <button key={w} type="button" className={width === w ? 'active' : ''}
                        onClick={() => updateNode(node => node.setWidth(w))}>{w}</button>)}
            <span className="sep"/>
            {ALIGNMENTS.map(a =>
                <button key={a} type="button" title={_t('Post.align_' + a)}
                        className={(align || 'center') === a ? 'active' : ''}
                        onClick={() => updateNode(node => node.setAlign(a))}>
                    <i className={`format ${a}-align`}/>
                </button>)}
            <span className="sep"/>
            <input className="editor-image-alt-input"
                   placeholder={_t('Post.imageAlt')}
                   defaultValue={altText || ''}
                   onKeyDown={e => e.stopPropagation()}
                   onBlur={e => {
                       const v = e.target.value
                       updateNode(node => node.setAltText(v))
                   }}/>
            <span className="sep"/>
            <button type="button" className="danger" title={_t('Post.imageDelete')}
                    onClick={() => updateNode(node => node.remove())}>✕
            </button>
        </div>}
    </figure>
}


function convertImageElement(domNode) {
    if (domNode instanceof HTMLImageElement) {
        const {alt: altText, src} = domNode
        if (src && !src.startsWith('file:')) {
            const width = domNode.style.width || (domNode.getAttribute('width') ? domNode.getAttribute('width') + 'px' : undefined)
            return {node: $createImageNode({src, altText, width})}
        }
    }
    return null
}

export class ImageNode extends DecoratorNode {

    static getType() {
        return 'image'
    }

    static clone(node) {
        return new ImageNode({
            src: node.__src,
            altText: node.__altText,
            width: node.__width,
            align: node.__align,
            caption: node.__caption,
            mediaId: node.__mediaId,
            uploading: node.__uploading
        }, node.__key)
    }

    static importJSON(serializedNode) {
        return $createImageNode(serializedNode)
    }

    static importDOM() {
        return {
            img: () => ({
                conversion: convertImageElement,
                priority: 0
            })
        }
    }

    constructor({src, altText, width, align, caption, mediaId, uploading} = {}, key) {
        super(key)
        this.__src = src || ''
        this.__altText = altText || ''
        this.__width = width || '100%'
        this.__align = align || 'center'
        this.__caption = caption || ''
        this.__mediaId = mediaId || null
        this.__uploading = !!uploading
    }

    exportJSON() {
        return {
            type: 'image',
            version: 1,
            // lokale blob-URLs (Upload noch nicht fertig) nie speichern
            src: this.__src && this.__src.startsWith('blob:') ? '' : this.__src,
            altText: this.__altText,
            width: this.__width,
            align: this.__align,
            caption: this.__caption,
            mediaId: this.__mediaId
        }
    }

    exportDOM() {
        const figure = document.createElement('figure')
        figure.className = `editor-image-figure align-${this.__align}`
        figure.style.width = this.__width
        const img = document.createElement('img')
        img.setAttribute('src', this.__src)
        img.setAttribute('alt', this.__altText)
        img.className = 'editor-image'
        figure.appendChild(img)
        if (this.__caption) {
            const figcaption = document.createElement('figcaption')
            figcaption.textContent = this.__caption
            figure.appendChild(figcaption)
        }
        return {element: figure}
    }

    createDOM(config) {
        const span = document.createElement('span')
        span.className = 'editor-image-node'
        return span
    }

    updateDOM() {
        return false
    }

    isInline() {
        return false
    }

    getTextContent() {
        return this.__caption ? this.__caption + '\n' : ''
    }

    getSrc() {
        return this.getLatest().__src
    }

    getAltText() {
        return this.getLatest().__altText
    }

    getMediaId() {
        return this.getLatest().__mediaId
    }

    setSrc(src) {
        this.getWritable().__src = src
    }

    setAltText(altText) {
        this.getWritable().__altText = altText
    }

    setWidth(width) {
        this.getWritable().__width = width
    }

    setAlign(align) {
        this.getWritable().__align = align
    }

    setCaption(caption) {
        this.getWritable().__caption = caption
    }

    setMediaId(mediaId) {
        this.getWritable().__mediaId = mediaId
    }

    setUploading(uploading) {
        this.getWritable().__uploading = uploading
    }

    decorate() {
        return <ImageComponent src={this.__src}
                               altText={this.__altText}
                               width={this.__width}
                               align={this.__align}
                               caption={this.__caption}
                               uploading={this.__uploading}
                               nodeKey={this.getKey()}/>
    }
}

export function $createImageNode(props) {
    return $applyNodeReplacement(new ImageNode(props))
}

export function $isImageNode(node) {
    return node instanceof ImageNode
}
