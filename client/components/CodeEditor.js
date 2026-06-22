import React, {useState, useImperativeHandle, forwardRef, memo, useRef, useEffect} from 'react'
import CodeMirrorWrapper from './codemirror6/CodeMirrorWrapper'
import {SimpleMenu,SimpleDialog} from 'ui/admin'
import GenericForm from './GenericForm'
import RenderInNewWindow from './layout/RenderInNewWindow'
import {generateContextMenu} from './codemirror6/contextMenu'
import {replaceLineWithText, formatCode} from './codemirror6/utils'
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

function CodeEditor(props,ref){
    const {controlled, hasContextMenu, mergeView, mergeValue, children, onScroll, onFullSize, onFileChange, showFab, fabButtonStyle, actions, onChange, onError, onBlur, lineNumbers, type, style, className, error, templates, propertyTemplates, fileSplit, identifier, readOnly, showCopyButton} = props

    if(!identifier){
        console.warn('CodeEditor identifier is missing')
    }

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
    }

    const handleCopy = () => {
        const content = editorViewRef.current?.state.doc.toString() ?? ''
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
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

    const comp = <StyledRoot error={hasError} inWindow={renderInWindow} className={className} style={style}>
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
                        clickEvent,
                        editorView,
                        showFileSplit,
                        propertyTemplates,
                        templates,
                        setEditData
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
                :
                <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
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
                                                   replaceLineWithText(editorViewRef.current, editData.lineData.number, `"${editData.key}":"${Util.escapeForJson(editDataFormRef.current.state.fields.data).replace(/\\/g, '\\\\\\')}"${editData.lineData.endsWithComma ? ',' : ''}`)
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
                             data: {fullWidth: true,label: editData.key,uitype: editData.uitype}}}/></SimpleDialog>)}
        <StyledEditorResizer onMouseDown={(e)=>{
            editorViewRef.resizerState = {pageY:e.pageY}
        }} onDblclick={(e)=>{
            if(onFullSize) {
                onFullSize(editorViewRef.current)
                setHeight(editorViewRef.current.dom.getBoundingClientRect().height+'px')
            }

        }}/>
    </StyledRoot>

    if(renderInWindow){
        return <RenderInNewWindow title="Code Editor" onClose={()=>{setRenderInWindow(false)}}>{comp}</RenderInNewWindow>
    }

    return comp
}

export default memo(forwardRef(CodeEditor), (prev, next)=>{
    return prev.identifier === next.identifier && prev.height === next.height && (!next.controlled || prev.children === next.children)
})