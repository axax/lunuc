import React, {useState, useImperativeHandle, forwardRef, memo, useRef, useEffect} from 'react'
import CodeMirrorWrapper from './codemirror6/CodeMirrorWrapper'
import {SimpleMenu,SimpleDialog} from 'ui/admin'
import GenericForm from './GenericForm'
import RenderInNewWindow from './layout/RenderInNewWindow'
import ResizableDivider from './ResizableDivider'
import {applyPatch, PatchError, buildPatchFeedback} from '../../extensions/cms/util/patch-utils.mjs'
import {generateContextMenu} from './codemirror6/contextMenu'
import {replaceLineWithText, formatCode, applyUnifiedDiff, scrollToLine, runTransformScript} from './codemirror6/utils'
import {StyledFile, seperateFiles, putFilesTogether, SPLIT_SIGN} from './codemirror6/fileSeperation'
import styled from '@emotion/styled'
import Util from '../util/index.mjs'
import {_t} from '../../util/i18n.mjs'

const StyledRoot = styled('div')(({ error, inWindow}) => ({
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    ...(error && {
        border: 'dashed 1px red',
        position:'relative',
        ':before':{
            pointerEvents:'none',
            content:'""',
            display:'block',
            position:'absolute',
            zIndex:2,
            left:0,
            top:0,
            right:0,
            bottom:0,
            background:'rgba(255,0,0,0.1)'
        }
    }),
    ...(inWindow && {
        height:'100%'
    })
}))

const StyledEditorResizer = styled('div')({
    position: 'absolute',
    height: '4px',
    background: 'black',
    right: 0,
    left:0,
    bottom: '-5px',
    cursor: 'ns-resize',
    zIndex: 999,
    opacity: 0,
    '&:hover': {
        opacity: 1
    }
})

const StyledCopyButtonWrapper = styled('div')({
    position: 'sticky',
    top: '8px',
    height: 0,
    overflow: 'visible',
    zIndex: 999,
    pointerEvents: 'none',
    order: -1,
    '@media print': {
        display: 'none'
    }
})

const StyledCopyButton = styled('button')(({ copied, theme }) => ({
    position: 'absolute',
    top: 0,
    right: '8px',
    pointerEvents: 'all',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    border: '1px solid ' + (theme.palette ? theme.palette.divider : '#e5e7eb'),
    borderRadius: '6px',
    cursor: 'pointer',
    background: theme.palette ? theme.palette.background.paper : '#ffffff',
    color: copied ? (theme.palette ? theme.palette.success.main : '#16a34a') : (theme.palette ? theme.palette.text.secondary : '#6b7280'),
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    '&:hover': {
        background: '#f3f4f6',
        borderColor: theme.palette ? theme.palette.divider : '#d1d5db',
        color: copied ? (theme.palette ? theme.palette.success.main : '#16a34a') : (theme.palette ? theme.palette.text.primary : '#374151'),
    }
}))

const StyledSplitRow = styled('div')({
    display: 'flex',
    alignItems: 'stretch',
    width: '100%'
})

const StyledSplitMain = styled('div')({
    flex: '1 1 auto',
    minWidth: 0
})

const StyledAiPane = styled('div', {
    shouldForwardProp: (prop) => prop !== 'width' && prop !== 'hidden'
})(({width, hidden}) => ({
    flex: '0 0 auto',
    width: `${width}px`,
    minWidth: '240px',
    maxWidth: '70vw',
    position: 'relative',
    display: hidden ? 'none' : 'flex',
    flexDirection: 'column',
    borderLeft: '1px solid rgba(0,0,0,0.12)'
}))

const StyledAiPaneHeader = styled('div')(({theme}) => ({
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    padding: '0.25rem 0.25rem 0.25rem 0.75rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: theme.palette ? theme.palette.text.secondary : '#6b7280',
    background: theme.palette ? theme.palette.background.default : '#f9fafb',
    borderBottom: '1px solid rgba(0,0,0,0.12)'
}))

const StyledAiPaneClose = styled('button')(({theme}) => ({
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    lineHeight: 1,
    fontSize: '0.875rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    color: 'inherit',
    '&:hover': {
        background: 'rgba(0,0,0,0.08)',
        color: theme.palette ? theme.palette.text.primary : '#111827'
    }
}))

function CodeEditor(props,ref){
    const {controlled, hasContextMenu, mergeView, mergeValue, children, onScroll, onFullSize, onFileChange, showFab, fabButtonStyle, actions, onChange, onError, onBlur, lineNumbers, type, style, className, error, templates, propertyTemplates, fileSplit, identifier, readOnly, showCopyButton} = props

    if(!identifier){
        console.warn('CodeEditor identifier is missing')
    }

    const [compareData, setCompareData] = useState(false)
    const [copied, setCopied] = useState(false)
    const [renderInWindow, setRenderInWindow] = useState(false)
    const [contextMenu, setContextMenu] = useState(false)
    const [stateError, setStateError] = useState(false)
    const [editData, setEditData] = useState(false)
    const [fileIndex, setFileIndex] = useState(props.fileIndex || 0)
    const [showFileSplit, setShowFileSplit] = useState(true)
    const [scrollPositions] = useState(Object.assign({}, props.scrollPosition))
    const [stateValue,setStateValue] = useState(children || '')
    const [height,setHeight] = useState(props.height)
    const [stateIdentifier,setStateIdentifier] = useState(identifier)
    const [isDataJson] = useState(props.forceJson || children && (children.constructor === Object || children.constructor === Array))
    const editorViewRef = useRef()
    const editDataFormRef = useRef()
    const [showAiAssistent, setShowAiAssistent] = useState(false)
    const [aiAssistentMounted, setAiAssistentMounted] = useState(false)
    const [aiAssistentWidth, setAiAssistentWidth] = useState(420)
    const [aiAssistentUrl] = useState(() => `/system/aiassistent?preview=true&inputkey=${encodeURIComponent('lunuc_code_llm_input_' + (identifier || 'code'))}&type=${encodeURIComponent(type || '')}`)
    const aiWidthRef = useRef(420)
    const dragStartWidthRef = useRef(null)
    // The Alt-Cmd-A keymap closure is only rebuilt when `identifier` changes, so
    // it would toggle against a stale showAiAssistent. Read the live value.
    const showAiAssistentRef = useRef(false)
    showAiAssistentRef.current = showAiAssistent

    if(props.onRef){
        props.onRef(editorViewRef)
    }

    useImperativeHandle(ref, () => ({
        getValue: () => editorViewRef.current.state.doc.toString(),
        setValue: (value) => {
            editorViewRef.current.dispatch({changes: {from: 0, to: editorViewRef.current.state.doc.length, insert: value}})
        },
        getStateError: () => stateError
    }))


    const mouseMove = e => {
        if (editorViewRef.resizerState) {
            const currentHeight = editorViewRef.current.dom.getBoundingClientRect().height

            const newHeight = currentHeight + (e.pageY - editorViewRef.resizerState.pageY)
            editorViewRef.resizerState.pageY = e.pageY
            if(newHeight>150) {
                editorViewRef.current.dom.style.height = `${newHeight}px`
            }
        }
    }

    const mouseUp = e => {
        if(editorViewRef.resizerState) {
            delete editorViewRef.resizerState
            setHeight(editorViewRef.current.dom.getBoundingClientRect().height+'px')
        }
        dragStartWidthRef.current = null
    }

    const handleCopy = () => {
        const content = editorViewRef.current?.state.doc.toString() ?? ''
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    // Opens (or reveals) the AI assistant split view. Primes the assistant's
    // input with an instruction that tells it how to send changes back: as a
    // <lunuc_component key="..." op="replace" type="codeEditor"> block - the
    // same tag/wire-format CmsPageTools already understands for CMS component
    // edits, just with an extra type="codeEditor" attribute so client-llm.js
    // can tell the two apart (different Apply-button gate, see there) without
    // a second tag. Matched here by `identifier`, which the message listener
    // below uses to recognize a change meant for this editor instance -
    // CmsPageTools' own ALLOWED_KEYS whitelist never matches an arbitrary
    // identifier, so the two listeners never step on each other.
    const openAiAssistent = (selectedContent) => {
        const storeKey = 'lunuc_code_llm_input_' + (identifier || 'code')
        // Without a selection the whole document is handed over, so the assistant
        // always has the code it is supposed to change.
        const view = editorViewRef.current
        const code = selectedContent ||
            (view ? putFilesTogether(files, finalFileIndex, view.state.doc.toString()) : '')

        const instructionLines = [
            `You are working on the code editor "${identifier}"${type ? ' (type: ' + type + ')' : ''}.`,
            `Return every change as <lunuc_component key="${identifier}" type="codeEditor" op="replace"${type ? ` lang="${type}"` : ''}><old_data>ORIGINAL SNIPPET</old_data><data>NEW SNIPPET</data></lunuc_component> - both snippets as plain code, without markdown fences. The type="codeEditor" attribute is required.`,
            'Keep old_data as short as possible but unique, and copy it byte for byte from the code below, including indentation and blank lines. Everything old_data matches is replaced by data, so any line you leave out of data is deleted - repeat the lines you want to keep.'
        ]
        if (code) {
            instructionLines.push('', selectedContent ? 'Selected code:' : 'Current code:', code)
        }
        try {
            sessionStorage.setItem(storeKey, instructionLines.join('\n'))
        } catch (e) {
            console.warn('CodeEditor: could not write llm_input to sessionStorage', e)
        }
        setAiAssistentMounted(true)
        setShowAiAssistent(true)
    }

    // The fab entry and Alt-Cmd-A toggle; the context menu entry always opens
    // (it carries the current selection).
    const toggleAiAssistent = (selectedContent) => {
        if (showAiAssistentRef.current) {
            setShowAiAssistent(false)
        } else {
            openAiAssistent(selectedContent)
        }
    }

    const handleAiResize = (newPosition) => {
        if (dragStartWidthRef.current === null) {
            dragStartWidthRef.current = aiWidthRef.current
        }
        const maxWidth = window.innerWidth * 0.7
        const next = Math.min(Math.max(dragStartWidthRef.current - newPosition, 240), maxWidth)
        if (next !== aiWidthRef.current) {
            aiWidthRef.current = next
            setAiAssistentWidth(next)
        }
    }

    useEffect(() => {
        setStateValue(children || '')
        setStateIdentifier(identifier)

        document.addEventListener('mousemove', mouseMove)
        document.addEventListener('mouseup', mouseUp)

        return () => {
            document.removeEventListener('mousemove', mouseMove)
            document.removeEventListener('mouseup', mouseUp)
        }
    }, [identifier,(controlled ? children : null)])


    let finalValue = isDataJson && stateValue && stateValue.constructor !== String ? JSON.stringify(stateValue, null, 2) : stateValue
    const hasError = !!(error || stateError)
    if(editorViewRef.current) {
        editorViewRef.current.hasError = hasError
    }
    console.log(`Render CodeEditor with height=${height || ''} and identifier=${stateIdentifier} fileIndex=${fileIndex} hasError=${hasError} isDataJson=${isDataJson} type=${type}`)

    const allActions = [
        {
            icon: 'view',
            name: _t('CodeEditor.reformatCode')+' (Alt-Cmd-L)',
            onClick: ()=>{formatCode(editorViewRef.current, type)}
        },
        {
            icon: 'launch',
            name:  _t('CodeEditor.openInNewWindow'),
            onClick: () => {
                setRenderInWindow(true)
            }
        }
    ]

    if (actions) {
        allActions.push(...actions)
    }

    let files, finalFileIndex = fileIndex
    if (fileSplit && !isDataJson && finalValue) {
        if (showFileSplit) {
            files = seperateFiles(finalValue)
            if(files.length>0) {
                if (finalFileIndex >= files.length) {
                    finalFileIndex = 0
                }
                finalValue = files[finalFileIndex].content
            }
        }else{
            finalFileIndex = 0
        }

        allActions.push({
            divider:true,
            icon:(showFileSplit ? 'visibilityOff' : 'visibility'),
            name: (showFileSplit ? _t('CodeEditor.hideFileSplit') : _t('CodeEditor.showFileSplit')), onClick: () => {
                // to keep value in state
                setStateValue(putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString()))
                setShowFileSplit(!showFileSplit)
            }
        })
    }

    allActions.push({
        divider: true,
        icon: showAiAssistent ? 'visibilityOff' : 'autoAwesome',
        name: showAiAssistent ? _t('CodeEditor.hideAiAssistent') : _t('CodeEditor.showAiAssistent'),
        onClick: () => {
            toggleAiAssistent()
        }
    })

    // Receives "Apply change" messages posted by the /system/aiassistent
    // iframe (same protocol/shape CmsPageTools listens for), scoped to this
    // editor instance via `identifier`. Mirrors the manual "Apply Patch"
    // dialog below: fuzzy patch when old_data is given, full replace otherwise.
    useEffect(() => {
        if (!aiAssistentMounted) {
            return
        }

        const handleAiAssistentMessage = (event) => {
            if (event.origin !== window.location.origin) {
                return
            }
            const d = event.data
            if (!d || !d.lunuc_component || d.type !== 'codeEditor' || !d.key || d.key !== identifier) {
                return
            }

            const operation = d.op || d.operation
            const respond = (success, error, extra) => {
                if (event.source && event.source.postMessage) {
                    event.source.postMessage({
                        lunuc_component_result: true,
                        key: d.key,
                        operation,
                        path: d.path,
                        success,
                        error: error || null,
                        ...extra
                    }, event.origin)
                }
            }

            const view = editorViewRef.current
            if (!view) {
                respond(false, 'Editor not ready')
                return
            }

            try {
                const currentFull = putFilesTogether(files, finalFileIndex, view.state.doc.toString())
                let newFull, matchedVia
                const isPatch = typeof d.old_data === 'string' && d.old_data.length > 0

                if (isPatch) {
                    const patchKey = type === 'css' ? 'style' : 'script'
                    const applied = applyPatch(currentFull, {oldData: d.old_data, data: d.data == null ? '' : d.data}, {key: patchKey})
                    newFull = applied.result
                    matchedVia = applied.matchedVia
                } else {
                    newFull = d.data == null ? '' : (d.data.constructor === String ? d.data : JSON.stringify(d.data, null, 2))
                }

                let displayContent = newFull
                if (files && showFileSplit) {
                    const newFiles = seperateFiles(newFull)
                    if (newFiles.length > 0) {
                        const idx = finalFileIndex < newFiles.length ? finalFileIndex : 0
                        displayContent = newFiles[idx].content
                    }
                }

                const firstVisibleLine = view.state.doc.lineAt(
                    view.elementAtHeight(view.dom.getBoundingClientRect().top - view.documentTop).from).number

                triggerOnChange(newFull)
                view.dispatch({
                    changes: {from: 0, to: view.state.doc.length, insert: displayContent}
                })
                scrollToLine(view, firstVisibleLine)
                respond(true, null, matchedVia ? {matchedVia} : undefined)
            } catch (e) {
                if (e instanceof PatchError) {
                    respond(false, buildPatchFeedback(e, 'script'))
                    return
                }
                console.error('CodeEditor: error applying AI assistant change:', e)
                respond(false, e.message)
            }
        }

        window.addEventListener('message', handleAiAssistentMessage)
        return () => {
            window.removeEventListener('message', handleAiAssistentMessage)
        }
    }, [aiAssistentMounted, files, finalFileIndex, showFileSplit, type, identifier])

    function triggerOnChange(fullCodeAsString) {
        let asJson
        if (isDataJson || type === 'json') {
            try {
                asJson = JSON.parse(fullCodeAsString)
                setStateError(false)
            } catch (jsonError) {
                setStateError(jsonError)
                if (onError) {
                    onError(jsonError, fullCodeAsString)
                }
            }
        }
        if (isDataJson) {
            // if input was an object output is an Object too
            setStateValue(asJson)

            if (onChange) {
                onChange(asJson)
            }
        } else {
            setStateValue(fullCodeAsString)

            if (onChange) {
                onChange(fullCodeAsString)
            }
        }
    }

    // In the split view the frame the consumer styles (border, margin, ...) belongs
    // around BOTH columns, so it moves up to StyledSplitRow - otherwise the editor
    // sits 16px lower than the assistant beside it and the border cuts between them.
    const comp = <StyledRoot error={hasError} inWindow={renderInWindow}
                             className={aiAssistentMounted ? undefined : className}
                             style={aiAssistentMounted ? undefined : style}>
        {files && <div>{files.map((file, i) => {
                return (<StyledFile key={'file' + i}
                                onClick={() => {
                                    // to keep value in state
                                    setStateValue(putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString()))
                                    setFileIndex(i)
                                    if (onFileChange) {
                                        onFileChange(i)
                                    }
                                }}
                                onContextMenu={(clickEvent) => {
                                    clickEvent.preventDefault()
                                    setContextMenu({left: clickEvent.clientX, top: clickEvent.clientY, items:[
                                            {
                                                icon:'edit',
                                                name: _t('CodeEditor.editFileSplitName'), onClick: () => {
                                                    setEditData({fileSplit:true,file,fields:{name:{fullWidth:true,label:'Name',required:true}}, values:{name:file.filename}})
                                                }
                                            },
                                            {
                                                icon:'delete',
                                                name: _t('CodeEditor.removeFileSplitName'), onClick: () => {
                                                    setEditData({deleteSplit:true,file})
                                                }
                                            }
                                        ]})
                                }}
                                active={i === finalFileIndex}>{file.filename}</StyledFile>)})}</div>}
        <CodeMirrorWrapper mergeView={mergeView} mergeValue={mergeValue} controlled={controlled}
            identifier={`${stateIdentifier}${showFileSplit?'-'+finalFileIndex:''}`}
            onChange={(codeAsString)=>{
                const fullCodeAsString = putFilesTogether(files, finalFileIndex, codeAsString)
                triggerOnChange(fullCodeAsString)
            }}
            lineNumbers={lineNumbers}
            type={type} readOnly={readOnly}
            onToggleAiAssistent={toggleAiAssistent}
            onBlur={(event, view)=>{
                if(onBlur) {
                    onBlur(event, view.state.doc.toString())
                }
            }}
            onEditorView={(ev)=> {editorViewRef.current = ev}}
            onFirstVisibleLineChange={(firstVisibleLine) => {
                if (onScroll) {
                    scrollPositions[finalFileIndex] = Object.assign({}, scrollPositions[finalFileIndex], {firstVisibleLine})
                    //console.debug('CodeEditor: new first visible line', firstVisibleLine)
                    onScroll(Object.assign({},scrollPositions))
                }
            }}
            onContextMenu={(clickEvent, editorView) => {
                if(hasContextMenu !== false) {
                    clickEvent.preventDefault()
                    setContextMenu(generateContextMenu({
                        type,
                        fileSplit,files, finalFileIndex,
                        setShowFileSplit,setStateValue,
                        setCompareData,
                        clickEvent,
                        editorView,
                        showFileSplit,
                        propertyTemplates,
                        templates,
                        setEditData,
                        toggleAiAssistent,
                        // read through the ref: this handler closure is only
                        // rebuilt when `identifier` changes, so a state value
                        // captured here would be stale
                        aiAssistentVisible: showAiAssistentRef.current
                    }))
                }
            }}
            style={{height:renderInWindow ? '100%': (height ? height : '30rem')}}
            firstVisibleLine={scrollPositions[finalFileIndex] ? scrollPositions[finalFileIndex].firstVisibleLine : 0}
            value={finalValue}/>

        {showCopyButton && (
            <StyledCopyButtonWrapper>
                <StyledCopyButton copied={copied} onClick={handleCopy} title="Copy to clipboard">
                    {copied ? (
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"
                             xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M15.188 5.11a.5.5 0 0 1 .752.626l-.056.084-7.5 9a.5.5 0 0 1-.738.033l-3.5-3.5-.064-.078a.501.501 0 0 1 .693-.693l.078.064 3.113 3.113 7.15-8.58z"/>
                        </svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                             aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    )}
                </StyledCopyButton>
            </StyledCopyButtonWrapper>
        )}

        {showFab && <SimpleMenu key="menu" mini fab color="secondary" style={{
            zIndex: 999,
            position: 'absolute',
            bottom: '8px',
            right: '8px', ...fabButtonStyle
        }} items={allActions}/>}
        {contextMenu && contextMenu.items.length > 0 && <SimpleMenu disablePortal={renderInWindow} anchorReference={"anchorPosition"} anchorPosition={contextMenu} noButton={true} open={contextMenu}
            onClose={() => {setContextMenu(false)}}
            mini items={contextMenu.items}/>}
        {hasError && <div style={{color: 'red'}}>{error ? error + ' ' : ''}{stateError ? stateError.message : ''}</div>}
        {editData &&
            (editData.deleteSplit ?
                <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="md" key="deleteDialog" open={true}
                              actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                              title={_t('CodeEditor.deleteFileSplitConfirmTitle')}
                              onClose={(action) => {
                                  if (action.key === 'yes') {
                                      if(editData.file){
                                          let content = putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString())
                                          const regex = new RegExp(`^${SPLIT_SIGN}${editData.file.filename}$`, 'gm');
                                          content = content.replace(regex, '')
                                          setFileIndex(0)
                                          triggerOnChange(content)
                                      }
                                  }
                                  setEditData(false)
                              }}>
                    {_t('CodeEditor.deleteFileSplitConfirm', editData.file)}
                </SimpleDialog>
                : editData.applyPatch ?
                    <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="md" key="applyPatchDialog" open={true}
                                  title={_t('CodeEditor.applyPatch')}
                                  actions={[{key: 'cancel', label: _t('core.cancel'), type: 'secondary'}, {key: 'ok', label: _t('core.save'), type: 'primary'}]}
                                  onClose={(action) => {
                                      if (action.key === 'ok') {
                                          const formValidation = editDataFormRef.current.validate()
                                          if (formValidation.isValid) {
                                              const diffText = editDataFormRef.current.state.fields.diff
                                              const currentContent = putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString())
                                              try {
                                                  const patchedContent = applyUnifiedDiff(currentContent, diffText)

                                                  // if file-split view is active, only show the patched
                                                  // content of the currently selected file in the editor
                                                  let displayContent = patchedContent
                                                  if (files && showFileSplit) {
                                                      const patchedFiles = seperateFiles(patchedContent)
                                                      if (patchedFiles.length > 0) {
                                                          const idx = finalFileIndex < patchedFiles.length ? finalFileIndex : 0
                                                          displayContent = patchedFiles[idx].content
                                                      }
                                                  }
                                                  const fistVisibleLine = editorViewRef.current.state.doc.lineAt(editorViewRef.current.elementAtHeight(editorViewRef.current.dom.getBoundingClientRect().top - editorViewRef.current.documentTop).from).number
                                                  editorViewRef.current.dispatch({
                                                      changes: {from: 0, to: editorViewRef.current.state.doc.length, insert: displayContent}
                                                  })
                                                  scrollToLine(editorViewRef.current, fistVisibleLine)
                                                  setStateError(false)
                                              } catch (patchError) {
                                                  setStateError(patchError)
                                              }
                                          }
                                      }
                                      setEditData(false)
                                  }}>
                        <GenericForm ref={editDataFormRef} primaryButton={false} values={{}} fields={{
                            diff: {fullWidth: true, label: _t('CodeEditor.diffInput'), uitype: 'textarea', required: true}
                        }}/>
                    </SimpleDialog>
                    : editData.transformScript ?
                        <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="md" key="transformDialog" open={true}
                                      title={_t('CodeEditor.runTransformScript')}
                                      actions={[
                                          {key: 'cancel', label: _t('core.cancel'), type: 'secondary'},
                                          ...(editData.preview && !editData.preview.error
                                              ? [{key: 'apply', label: _t('core.save'), type: 'primary'}]
                                              : [{key: 'run', label: _t('CodeEditor.transformPreview'), type: 'primary'}])
                                      ]}
                                      onClose={(action) => {
                                          if (action.key === 'run') {
                                              const formValidation = editDataFormRef.current.validate()
                                              if (!formValidation.isValid) return
                                              const script = editDataFormRef.current.state.fields.script
                                              const current = putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString())
                                              setEditData({transformScript: true, script, preview: runTransformScript(current, script)})
                                              return
                                          }
                                          if (action.key === 'apply' && editData.preview && !editData.preview.error) {
                                              const firstVisibleLine = editorViewRef.current.state.doc.lineAt(
                                                  editorViewRef.current.elementAtHeight(
                                                      editorViewRef.current.dom.getBoundingClientRect().top -
                                                      editorViewRef.current.documentTop).from).number

                                              // Show only the current split in the editor, keep the whole
                                              // document in state — same handling as applyPatch above.
                                              let displayContent = editData.preview.content
                                              if (files && showFileSplit) {
                                                  const newFiles = seperateFiles(displayContent)
                                                  if (newFiles.length > 0) {
                                                      const idx = finalFileIndex < newFiles.length ? finalFileIndex : 0
                                                      displayContent = newFiles[idx].content
                                                  }
                                              }
                                              triggerOnChange(editData.preview.content)
                                              editorViewRef.current.dispatch({
                                                  changes: {from: 0, to: editorViewRef.current.state.doc.length, insert: displayContent}
                                              })
                                              scrollToLine(editorViewRef.current, firstVisibleLine)
                                              setStateError(false)
                                          }
                                          setEditData(false)
                                      }}>
                            <GenericForm ref={editDataFormRef} primaryButton={false}
                                         values={{script: editData.script || ''}} fields={{
                                script: {
                                    fullWidth: true,
                                    label: _t('CodeEditor.transformScriptInput'),
                                    uitype: 'textarea',
                                    required: true,
                                    helperText: _t('CodeEditor.transformScriptHelp')
                                }
                            }}/>
                            {editData.preview && (editData.preview.error
                                ? <div style={{color: 'red', whiteSpace: 'pre-wrap', marginTop: '1rem'}}>
                                    {editData.preview.error}
                                </div>
                                : <div style={{marginTop: '1rem'}}>
                                    <strong>{editData.preview.unchanged
                                        ? _t('CodeEditor.transformNoChange')
                                        : _t('CodeEditor.transformResult', {
                                            lines: editData.preview.deltaLines,
                                            chars: editData.preview.deltaChars
                                        })}</strong>
                                    {editData.preview.logs.length > 0 &&
                                        <pre style={{maxHeight: '30vh', overflow: 'auto', fontSize: '12px'}}>
                                          {editData.preview.logs.join('\n')}
                                      </pre>}
                                </div>)}
                        </SimpleDialog>
                        :
                    <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="md" key="editDataDialog" open={true}
                                  onClose={(action) => {
                                      if (action.key === 'ok') {
                                          const formValidation = editDataFormRef.current.validate()
                                          if (formValidation.isValid) {
                                              if (editData.fileSplit) {
                                                  if(editData.file){
                                                      let content = putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString())
                                                      const regex = new RegExp(`^${SPLIT_SIGN}${editData.file.filename}$`, 'gm');
                                                      content = content.replace(regex, SPLIT_SIGN+Util.escapeForJson(editDataFormRef.current.state.fields.name))
                                                      triggerOnChange(content)
                                                  }else {
                                                      editorViewRef.current.dispatch({
                                                          changes: {
                                                              from: editData.lineInfo.to,
                                                              to: editData.lineInfo.to,
                                                              insert: `${editData.lineInfo.text.length > 0 ? '\n' : ''}${SPLIT_SIGN}${Util.escapeForJson(editDataFormRef.current.state.fields.name)}`
                                                          }
                                                      })
                                                      setStateValue(putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString()))
                                                      setFileIndex(files && files.length > 0 ? finalFileIndex + 1 : 1)
                                                  }
                                              } else {
                                                  replaceLineWithText(editorViewRef.current, editData.lineData.number, `"${editData.key}":"${Util.escapeForJson(editDataFormRef.current.state.fields.data)}"${editData.lineData.endsWithComma ? ',' : ''}`)
                                                  formatCode(editorViewRef.current)
                                              }
                                          }
                                      }
                                      setEditData(false)
                                  }}
                                  actions={[{
                                      key: 'cancel',
                                      label: _t('core.cancel'),
                                      type: 'secondary'
                                  }, {
                                      key: 'ok',
                                      label: _t('core.save'),
                                      type: 'primary'
                                  }]}
                                  title={'Edit'}>
                        <GenericForm ref={editDataFormRef} primaryButton={false} values={editData.values || {data: editData.value}} fields={editData.fields || {
                            data: {fullWidth: true,label: editData.key,uitype: 'editor'}}}/></SimpleDialog>)}
        <StyledEditorResizer onMouseDown={(e)=>{
            editorViewRef.resizerState = {pageY:e.pageY}
        }} onDblclick={(e)=>{
            if(onFullSize) {
                onFullSize(editorViewRef.current)
                setHeight(editorViewRef.current.dom.getBoundingClientRect().height+'px')
            }

        }}/>
        {compareData && <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="lg"
                                      key="compareDialog" open={true}
                                      title={_t('CodeEditor.compareWithClipboard')}
                                      actions={[{key: 'close', label: _t('core.cancel'), type: 'primary'}]}
                                      onClose={() => {setCompareData(false)}}>
            {compareData.error ?
                <div style={{color: 'red'}}>{compareData.error}</div>
                :
                <CodeMirrorWrapper identifier={`${stateIdentifier}-compare`}
                                   type={type}
                                   lineNumbers={lineNumbers}
                                   readOnly={true}
                                   mergeView={true}
                                   mergeValue={compareData.clipboard}
                                   style={{height: '60vh'}}
                                   value={compareData.current}/>
            }
        </SimpleDialog>}
    </StyledRoot>

    const withAiAssistent = !aiAssistentMounted ? comp : (
        <StyledSplitRow className={className} style={style}>
            <StyledSplitMain>{comp}</StyledSplitMain>
            <StyledAiPane width={aiAssistentWidth} hidden={!showAiAssistent}>
                <ResizableDivider direction="horizontal" onResize={handleAiResize}/>
                <StyledAiPaneHeader>
                    <span>{_t('CodeEditor.aiAssistent')}</span>
                    <StyledAiPaneClose type="button" title={_t('CodeEditor.hideAiAssistent')}
                                       onClick={() => {setShowAiAssistent(false)}}>&#10005;</StyledAiPaneClose>
                </StyledAiPaneHeader>
                <iframe src={aiAssistentUrl} title={_t('CodeEditor.aiAssistent')}
                        style={{flex: '1 1 auto', width: '100%', border: 'none', display: 'block'}}/>
            </StyledAiPane>
        </StyledSplitRow>
    )

    if(renderInWindow){
        return <RenderInNewWindow title="Code Editor" onClose={()=>{setRenderInWindow(false)}}>{withAiAssistent}</RenderInNewWindow>
    }

    return withAiAssistent
}

export default memo(forwardRef(CodeEditor), (prev, next)=>{
    return prev.identifier === next.identifier && prev.height === next.height && (!next.controlled || prev.children === next.children)
})