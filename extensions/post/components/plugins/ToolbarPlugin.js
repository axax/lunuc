import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {
    $createParagraphNode,
    $getNodeByKey,
    $getSelection,
    $isRangeSelection,
    $isTextNode,
    $setSelection,
    CAN_REDO_COMMAND,
    CAN_UNDO_COMMAND,
    COMMAND_PRIORITY_LOW,
    COMMAND_PRIORITY_NORMAL,
    FORMAT_ELEMENT_COMMAND,
    FORMAT_TEXT_COMMAND,
    KEY_MODIFIER_COMMAND,
    REDO_COMMAND,
    SELECTION_CHANGE_COMMAND,
    UNDO_COMMAND
} from 'lexical'
import {$isLinkNode, TOGGLE_LINK_COMMAND} from '@lexical/link'
import {
    $getSelectionStyleValueForProperty,
    $isAtNodeEnd,
    $patchStyleText,
    $setBlocksType
} from '@lexical/selection'
import {$findMatchingParent, $getNearestNodeOfType, mergeRegister} from '@lexical/utils'
import {
    $isListNode,
    INSERT_CHECK_LIST_COMMAND,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    ListNode,
    REMOVE_LIST_COMMAND
} from '@lexical/list'
import {$createHeadingNode, $createQuoteNode, $isHeadingNode} from '@lexical/rich-text'
import {$createCodeNode, $isCodeNode, getDefaultCodeLanguage} from '@lexical/code-core'
import {getCodeLanguages} from '@lexical/code-prism'
import {
    $deleteTableColumnAtSelection,
    $deleteTableRowAtSelection,
    $insertTableColumnAtSelection,
    $insertTableRowAtSelection,
    $isTableCellNode,
    $isTableNode,
    INSERT_TABLE_COMMAND
} from '@lexical/table'
import {INSERT_HORIZONTAL_RULE_COMMAND} from '@lexical/react/LexicalHorizontalRuleNode'
import {_t} from 'util/i18n.mjs'
import {INSERT_IMAGE_COMMAND, UPLOAD_IMAGE_COMMAND} from './ImagesPlugin.js'
import Async from 'client/components/Async'

// Media-Auswahl nur bei Bedarf laden (nicht im Frontend-Bundle des PostRenderers)
const MediaPickerDialog = (props) => <Async {...props}
                                            load={() => import(/* webpackChunkName: "admin" */ '../MediaPickerDialog')}/>

const BLOCK_TYPES = [
    {key: 'paragraph', icon: 'paragraph'},
    {key: 'h1', icon: 'h1'},
    {key: 'h2', icon: 'h2'},
    {key: 'h3', icon: 'h3'},
    {key: 'ul', icon: 'ul'},
    {key: 'ol', icon: 'ol'},
    {key: 'check', icon: 'check'},
    {key: 'quote', icon: 'quote'},
    {key: 'code', icon: 'code'}
]

const TEXT_COLORS = ['#000000', '#5f6368', '#d93025', '#e8710a', '#f9ab00', '#188038', '#1a73e8', '#9334e6', '#c5221f', '#ffffff']
const HIGHLIGHT_COLORS = ['#fff475', '#fbbc04', '#ccff90', '#a7ffeb', '#cbf0f8', '#aecbfa', '#d7aefb', '#fdcfe8', '#e6c9a8', '#e8eaed']

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl+'

function Divider() {
    return <div className="divider"/>
}

function getSelectedNode(selection) {
    const anchor = selection.anchor
    const focus = selection.focus
    const anchorNode = anchor.getNode()
    const focusNode = focus.getNode()
    if (anchorNode === focusNode) {
        return anchorNode
    }
    if (selection.isBackward()) {
        return $isAtNodeEnd(focus) ? anchorNode : focusNode
    }
    return $isAtNodeEnd(anchor) ? focusNode : anchorNode
}

/**
 * Generisches Dropdown, wird per Portal an den body gehängt,
 * damit es nicht vom Editor-Container abgeschnitten wird.
 */
function DropDown({buttonClassName, buttonLabel, buttonIcon, title, children, disabled, stopCloseOnClickSelf}) {
    const buttonRef = useRef(null)
    const dropDownRef = useRef(null)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        if (!open) {
            return
        }
        const button = buttonRef.current
        const dropDown = dropDownRef.current
        if (button && dropDown) {
            const rect = button.getBoundingClientRect()
            const left = Math.min(rect.left, window.innerWidth - dropDown.offsetWidth - 10)
            dropDown.style.top = `${rect.bottom + 4}px`
            dropDown.style.left = `${Math.max(10, left)}px`
        }
        const handleClick = (event) => {
            if (button.contains(event.target)) {
                return
            }
            if (stopCloseOnClickSelf && dropDown && dropDown.contains(event.target)) {
                return
            }
            setOpen(false)
        }
        const handleKey = (event) => {
            if (event.key === 'Escape') {
                setOpen(false)
            }
        }
        document.addEventListener('click', handleClick)
        document.addEventListener('keydown', handleKey)
        return () => {
            document.removeEventListener('click', handleClick)
            document.removeEventListener('keydown', handleKey)
        }
    }, [open, stopCloseOnClickSelf])

    return <>
        <button type="button"
                ref={buttonRef}
                disabled={disabled}
                title={title}
                aria-label={title}
                className={'toolbar-item ' + (buttonClassName || '')}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setOpen(!open)}>
            {buttonIcon && <span className={'icon ' + buttonIcon}/>}
            {buttonLabel && <span className="text">{buttonLabel}</span>}
            <i className="chevron-down"/>
        </button>
        {open && createPortal(
            <div className="dropdown" ref={dropDownRef} onMouseDown={e => {
                if (e.target.tagName !== 'INPUT') {
                    e.preventDefault()
                }
            }}>
                {typeof children === 'function' ? children(() => setOpen(false)) : children}
            </div>, document.body)}
    </>
}

function DropDownItem({onClick, icon, label, active, shortcut}) {
    return <button type="button" className={'item' + (active ? ' active-item' : '')} onClick={onClick}>
        {icon && <span className={'icon ' + icon}/>}
        <span className="text">{label}</span>
        {shortcut && <span className="shortcut">{shortcut}</span>}
        {active && <span className="active"/>}
    </button>
}

function ToolbarButton({onClick, active, disabled, title, icon, children}) {
    return <button type="button"
                   disabled={disabled}
                   onMouseDown={e => e.preventDefault()}
                   onClick={onClick}
                   className={'toolbar-item spaced' + (active ? ' active' : '')}
                   title={title}
                   aria-label={title}>
        {icon ? <i className={'format ' + icon}/> : children}
    </button>
}

function ColorSwatches({colors, value, onChange, close, resetLabel}) {
    return <div className="color-picker">
        <div className="swatches">
            {colors.map(c => <button type="button" key={c}
                                     className={'swatch' + (value === c ? ' selected' : '')}
                                     style={{backgroundColor: c}}
                                     title={c}
                                     onClick={() => {
                                         onChange(c)
                                         close()
                                     }}/>)}
        </div>
        <div className="color-picker-footer">
            <label className="custom-color">
                <input type="color" value={value && value.startsWith('#') ? value : '#000000'}
                       onChange={e => onChange(e.target.value)}/>
                {_t('Post.customColor')}
            </label>
            <button type="button" className="reset" onClick={() => {
                onChange(null)
                close()
            }}>{resetLabel}</button>
        </div>
    </div>
}

function TableSizePicker({onSelect}) {
    const [size, setSize] = useState({rows: 0, cols: 0})
    const MAX = 8
    const cells = []
    for (let r = 1; r <= MAX; r++) {
        for (let c = 1; c <= MAX; c++) {
            cells.push(<span key={r + '-' + c}
                             className={'cell' + (r <= size.rows && c <= size.cols ? ' on' : '')}
                             onMouseEnter={() => setSize({rows: r, cols: c})}
                             onClick={() => onSelect(r, c)}/>)
        }
    }
    return <div className="table-size-picker">
        <div className="grid">{cells}</div>
        <div className="label">{size.rows > 0 ? `${size.cols} × ${size.rows}` : _t('Post.tableSize')}</div>
    </div>
}

function FloatingLinkEditor({editor, linkUrl, onClose}) {
    const editorRef = useRef(null)
    const inputRef = useRef(null)
    const [url, setUrl] = useState(linkUrl)
    const [isEditMode, setEditMode] = useState(!linkUrl || linkUrl === 'https://')

    useEffect(() => {
        setUrl(linkUrl)
    }, [linkUrl])

    const position = useCallback(() => {
        const elem = editorRef.current
        const nativeSelection = window.getSelection()
        const rootElement = editor.getRootElement()
        if (!elem || !nativeSelection || nativeSelection.rangeCount === 0 || !rootElement ||
            !rootElement.contains(nativeSelection.anchorNode)) {
            return
        }
        const rect = nativeSelection.getRangeAt(0).getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
            return
        }
        elem.style.opacity = '1'
        elem.style.top = `${rect.bottom + window.pageYOffset + 8}px`
        elem.style.left = `${Math.max(10, rect.left + window.pageXOffset - elem.offsetWidth / 2 + rect.width / 2)}px`
    }, [editor])

    useEffect(() => {
        position()
        return editor.registerUpdateListener(() => position())
    }, [editor, position, isEditMode])

    useEffect(() => {
        if (isEditMode && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditMode])

    const apply = () => {
        if (url && url !== 'https://') {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, {url, target: /^https?:\/\//.test(url) ? '_blank' : null})
        } else {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
        }
        setEditMode(false)
        editor.focus()
    }

    return <div ref={editorRef} className="link-editor">
        {isEditMode ?
            <div className="link-input-row">
                <input ref={inputRef}
                       className="link-input"
                       value={url}
                       placeholder="https://"
                       onChange={e => setUrl(e.target.value)}
                       onKeyDown={e => {
                           if (e.key === 'Enter') {
                               e.preventDefault()
                               apply()
                           } else if (e.key === 'Escape') {
                               e.preventDefault()
                               setEditMode(false)
                               editor.focus()
                           }
                       }}/>
                <button type="button" className="link-btn" onClick={apply}>{_t('Post.ok')}</button>
            </div> :
            <div className="link-input-row">
                <a className="link-view" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                <button type="button" className="link-btn" onMouseDown={e => e.preventDefault()}
                        onClick={() => setEditMode(true)}>{_t('Post.edit')}</button>
                <button type="button" className="link-btn" onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
                            onClose && onClose()
                        }}>{_t('Post.removeLink')}</button>
            </div>}
    </div>
}

export default function ToolbarPlugin() {
    const [editor] = useLexicalComposerContext()
    const fileInputRef = useRef(null)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const [blockType, setBlockType] = useState('paragraph')
    const [selectedElementKey, setSelectedElementKey] = useState(null)
    const [codeLanguage, setCodeLanguage] = useState('')
    const [linkUrl, setLinkUrl] = useState(null)
    const [formats, setFormats] = useState({})
    const [fontColor, setFontColor] = useState('')
    const [bgColor, setBgColor] = useState('')
    const [elementFormat, setElementFormat] = useState('left')
    const [inTable, setInTable] = useState(false)
    const [showMediaPicker, setShowMediaPicker] = useState(false)
    const savedSelection = useRef(null)

    const openMediaPicker = () => {
        // Auswahl merken, da der Dialog den Fokus übernimmt
        editor.getEditorState().read(() => {
            const selection = $getSelection()
            savedSelection.current = selection ? selection.clone() : null
        })
        setShowMediaPicker(true)
    }

    const insertMediaImages = (images) => {
        editor.update(() => {
            if (savedSelection.current) {
                $setSelection(savedSelection.current.clone())
            }
            images.forEach(image => editor.dispatchCommand(INSERT_IMAGE_COMMAND, image))
        })
        savedSelection.current = null
        setTimeout(() => editor.focus(), 0)
    }

    const updateToolbar = useCallback(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
            return
        }
        const anchorNode = selection.anchor.getNode()
        let element = anchorNode.getKey() === 'root'
            ? anchorNode
            : $findMatchingParent(anchorNode, (e) => {
                const parent = e.getParent()
                return parent !== null && parent.getKey() === 'root'
            })
        if (element === null) {
            element = anchorNode.getTopLevelElementOrThrow()
        }
        const elementKey = element.getKey()
        const elementDOM = editor.getElementByKey(elementKey)

        if (elementDOM !== null) {
            setSelectedElementKey(elementKey)
            if ($isListNode(element)) {
                const parentList = $getNearestNodeOfType(anchorNode, ListNode)
                const list = parentList || element
                const listType = list.getListType()
                setBlockType(listType === 'check' ? 'check' : list.getTag())
            } else {
                const type = $isHeadingNode(element) ? element.getTag() : element.getType()
                setBlockType(type)
                if ($isCodeNode(element)) {
                    setCodeLanguage(element.getLanguage() || getDefaultCodeLanguage())
                }
            }
            if (element.getFormatType) {
                setElementFormat(element.getFormatType() || 'left')
            }
        }

        setFormats({
            bold: selection.hasFormat('bold'),
            italic: selection.hasFormat('italic'),
            underline: selection.hasFormat('underline'),
            strikethrough: selection.hasFormat('strikethrough'),
            code: selection.hasFormat('code'),
            subscript: selection.hasFormat('subscript'),
            superscript: selection.hasFormat('superscript')
        })
        setFontColor($getSelectionStyleValueForProperty(selection, 'color', ''))
        setBgColor($getSelectionStyleValueForProperty(selection, 'background-color', ''))

        const node = getSelectedNode(selection)
        const linkNode = $isLinkNode(node) ? node : $findMatchingParent(node, $isLinkNode)
        setLinkUrl(linkNode ? linkNode.getURL() : null)

        setInTable(!!$findMatchingParent(anchorNode, $isTableCellNode))
    }, [editor])

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({editorState}) => {
                editorState.read(() => updateToolbar())
            }),
            editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
                updateToolbar()
                return false
            }, COMMAND_PRIORITY_LOW),
            editor.registerCommand(CAN_UNDO_COMMAND, (payload) => {
                setCanUndo(payload)
                return false
            }, COMMAND_PRIORITY_LOW),
            editor.registerCommand(CAN_REDO_COMMAND, (payload) => {
                setCanRedo(payload)
                return false
            }, COMMAND_PRIORITY_LOW),
            // Ctrl/Cmd+K -> Link
            editor.registerCommand(KEY_MODIFIER_COMMAND, (event) => {
                const {key, ctrlKey, metaKey, shiftKey} = event
                if ((ctrlKey || metaKey) && !shiftKey && key.toLowerCase() === 'k') {
                    event.preventDefault()
                    editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl ? null : 'https://')
                    return true
                }
                return false
            }, COMMAND_PRIORITY_NORMAL)
        )
    }, [editor, updateToolbar, linkUrl])

    const formatBlock = (type) => {
        if (type === blockType) {
            if (type === 'ul' || type === 'ol' || type === 'check') {
                editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
            }
            return
        }
        if (type === 'ul') {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        } else if (type === 'ol') {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        } else if (type === 'check') {
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
        } else {
            editor.update(() => {
                const selection = $getSelection()
                if (!$isRangeSelection(selection)) {
                    return
                }
                if (type === 'paragraph') {
                    $setBlocksType(selection, () => $createParagraphNode())
                } else if (type === 'quote') {
                    $setBlocksType(selection, () => $createQuoteNode())
                } else if (type === 'code') {
                    $setBlocksType(selection, () => $createCodeNode())
                } else if (/^h[1-6]$/.test(type)) {
                    $setBlocksType(selection, () => $createHeadingNode(type))
                }
            })
        }
    }

    const applyStyle = (styles) => {
        editor.update(() => {
            const selection = $getSelection()
            if (selection !== null) {
                $patchStyleText(selection, styles)
            }
        })
    }

    const clearFormatting = () => {
        editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
                selection.getNodes().forEach(node => {
                    if ($isTextNode(node)) {
                        node.setFormat(0)
                        node.setStyle('')
                    }
                })
                $patchStyleText(selection, {color: null, 'background-color': null})
            }
        })
    }

    const tableAction = (fn) => editor.update(() => fn())

    const deleteTable = () => {
        editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
                const table = $findMatchingParent(selection.anchor.getNode(), $isTableNode)
                if (table) {
                    table.remove()
                }
            }
        })
    }

    const codeLanguages = useMemo(() => getCodeLanguages(), [])
    const onCodeLanguageSelect = useCallback((e) => {
        editor.update(() => {
            if (selectedElementKey !== null) {
                const node = $getNodeByKey(selectedElementKey)
                if ($isCodeNode(node)) {
                    node.setLanguage(e.target.value)
                }
            }
        })
    }, [editor, selectedElementKey])

    const insertLink = useCallback(() => {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl ? null : 'https://')
    }, [editor, linkUrl])

    if (!editor.isEditable()) {
        return null
    }

    const currentBlock = BLOCK_TYPES.find(b => b.key === blockType) || BLOCK_TYPES[0]

    return (
        <div className="toolbar">
            <ToolbarButton disabled={!canUndo} title={_t('Post.undo') + ` (${MOD}Z)`} icon="undo"
                           onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}/>
            <ToolbarButton disabled={!canRedo} title={_t('Post.redo') + ` (${MOD}${isMac ? '⇧Z' : 'Y'})`} icon="redo"
                           onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}/>
            <Divider/>

            <DropDown buttonClassName="block-controls"
                      buttonIcon={'block-type ' + currentBlock.icon}
                      buttonLabel={_t('Post.block_' + currentBlock.key)}
                      title={_t('Post.blockType')}>
                {close => BLOCK_TYPES.map(b =>
                    <DropDownItem key={b.key}
                                  icon={b.icon}
                                  label={_t('Post.block_' + b.key)}
                                  active={blockType === b.key}
                                  onClick={() => {
                                      formatBlock(b.key)
                                      close()
                                  }}/>)}
            </DropDown>
            <Divider/>

            {blockType === 'code' ? <>
                <select className="toolbar-item code-language" onChange={onCodeLanguageSelect} value={codeLanguage}>
                    <option hidden={true} value=""/>
                    {codeLanguages.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
                <i className="chevron-down inside"/>
            </> : <>
                <ToolbarButton active={formats.bold} title={_t('Post.bold') + ` (${MOD}B)`} icon="bold"
                               onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}/>
                <ToolbarButton active={formats.italic} title={_t('Post.italic') + ` (${MOD}I)`} icon="italic"
                               onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}/>
                <ToolbarButton active={formats.underline} title={_t('Post.underline') + ` (${MOD}U)`} icon="underline"
                               onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}/>
                <ToolbarButton active={formats.strikethrough} title={_t('Post.strikethrough')} icon="strikethrough"
                               onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}/>
                <ToolbarButton active={formats.code} title={_t('Post.inlineCode')} icon="code"
                               onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')}/>
                <ToolbarButton active={!!linkUrl} title={_t('Post.link') + ` (${MOD}K)`} icon="link"
                               onClick={insertLink}/>
                {linkUrl !== null && createPortal(
                    <FloatingLinkEditor key={linkUrl} editor={editor} linkUrl={linkUrl}/>, document.body)}

                <DropDown buttonClassName="more-format" buttonIcon="dots" title={_t('Post.moreFormats')}>
                    {close => <>
                        <DropDownItem icon="subscript" label={_t('Post.subscript')} active={formats.subscript}
                                      onClick={() => {
                                          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript')
                                          close()
                                      }}/>
                        <DropDownItem icon="superscript" label={_t('Post.superscript')} active={formats.superscript}
                                      onClick={() => {
                                          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript')
                                          close()
                                      }}/>
                        <DropDownItem icon="eraser" label={_t('Post.clearFormatting')}
                                      onClick={() => {
                                          clearFormatting()
                                          close()
                                      }}/>
                    </>}
                </DropDown>
                <Divider/>

                <DropDown buttonClassName="color" buttonIcon="font-color" title={_t('Post.textColor')}
                          stopCloseOnClickSelf={true}>
                    {close => <ColorSwatches colors={TEXT_COLORS} value={fontColor} close={close}
                                             resetLabel={_t('Post.resetColor')}
                                             onChange={c => applyStyle({color: c})}/>}
                </DropDown>
                <DropDown buttonClassName="color" buttonIcon="highlight" title={_t('Post.highlightColor')}
                          stopCloseOnClickSelf={true}>
                    {close => <ColorSwatches colors={HIGHLIGHT_COLORS} value={bgColor} close={close}
                                             resetLabel={_t('Post.resetColor')}
                                             onChange={c => applyStyle({'background-color': c})}/>}
                </DropDown>
                <Divider/>

                <DropDown buttonClassName="align" buttonIcon={'format-' + elementFormat + '-align'}
                          title={_t('Post.alignment')}>
                    {close => ['left', 'center', 'right', 'justify'].map(a =>
                        <DropDownItem key={a} icon={'format-' + a + '-align'} label={_t('Post.align_' + a)}
                                      active={elementFormat === a}
                                      onClick={() => {
                                          editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, a)
                                          close()
                                      }}/>)}
                </DropDown>
                <Divider/>
            </>}

            <DropDown buttonClassName="insert-image" buttonIcon="image" title={_t('Post.insertImage')}>
                {close => <>
                    <DropDownItem icon="upload" label={_t('Post.uploadImage')} onClick={() => {
                        close()
                        fileInputRef.current && fileInputRef.current.click()
                    }}/>
                    <DropDownItem icon="image" label={_t('Post.chooseFromMedia')} onClick={() => {
                        close()
                        openMediaPicker()
                    }}/>
                </>}
            </DropDown>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display: 'none'}}
                   onChange={e => {
                       if (e.target.files && e.target.files.length) {
                           editor.dispatchCommand(UPLOAD_IMAGE_COMMAND, e.target.files)
                       }
                       e.target.value = ''
                   }}/>
            {showMediaPicker && <MediaPickerDialog open={true}
                                                   onClose={() => setShowMediaPicker(false)}
                                                   onSelect={insertMediaImages}/>}
            <DropDown buttonClassName="insert-table" buttonIcon="table" title={_t('Post.insertTable')}>
                {close => <TableSizePicker onSelect={(rows, cols) => {
                    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
                        rows: String(rows),
                        columns: String(cols),
                        includeHeaders: {rows: true, columns: false}
                    })
                    close()
                }}/>}
            </DropDown>
            <ToolbarButton title={_t('Post.insertHr')} icon="hr"
                           onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}/>

            {inTable && <>
                <Divider/>
                <DropDown buttonClassName="table-actions" buttonLabel={_t('Post.table')} title={_t('Post.tableActions')}>
                    {close => <>
                        <DropDownItem label={_t('Post.rowAbove')} onClick={() => {
                            tableAction(() => $insertTableRowAtSelection(false))
                            close()
                        }}/>
                        <DropDownItem label={_t('Post.rowBelow')} onClick={() => {
                            tableAction(() => $insertTableRowAtSelection(true))
                            close()
                        }}/>
                        <DropDownItem label={_t('Post.colLeft')} onClick={() => {
                            tableAction(() => $insertTableColumnAtSelection(false))
                            close()
                        }}/>
                        <DropDownItem label={_t('Post.colRight')} onClick={() => {
                            tableAction(() => $insertTableColumnAtSelection(true))
                            close()
                        }}/>
                        <DropDownItem label={_t('Post.deleteRow')} onClick={() => {
                            tableAction(() => $deleteTableRowAtSelection())
                            close()
                        }}/>
                        <DropDownItem label={_t('Post.deleteCol')} onClick={() => {
                            tableAction(() => $deleteTableColumnAtSelection())
                            close()
                        }}/>
                        <DropDownItem label={_t('Post.deleteTable')} onClick={() => {
                            deleteTable()
                            close()
                        }}/>
                    </>}
                </DropDown>
            </>}
        </div>
    )
}
