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
    bottom: 0,
    cursor: 'ns-resize',
    zIndex: 999,
    opacity: 0,
    '&:hover': {
        opacity: 1
    }
})


function CodeEditor(props,ref){
    const {hasContextMenu, mergeView, mergeValue, children, onScroll, onFullSize, onFileChange, showFab, fabButtonStyle, actions, onChange, onError, onBlur, lineNumbers, type, style, className, error, templates, propertyTemplates, fileSplit, identifier, readOnly} = props

    if(!identifier){
        console.warn('CodeEditor identifier is missing')
    }

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

    useEffect(() => {
        setStateValue(children || '')
        setStateIdentifier(identifier)

        document.addEventListener('mousemove', mouseMove)
        document.addEventListener('mouseup', mouseUp)

        return () => {
            document.removeEventListener('mousemove', mouseMove)
            document.removeEventListener('mouseup', mouseUp)
        }
    }, [identifier])



    let finalValue = isDataJson && stateValue.constructor !== String ? JSON.stringify(stateValue, null, 2) : stateValue
    const hasError = (error || stateError)

    console.log(`Render CodeEditor with height=${height || ''} and identifier=${stateIdentifier} fileIndex=${fileIndex}`)

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
            name: (showFileSplit ? 'Hide' : 'Show') + ' File split', onClick: () => {
                // to keep value in state
                setStateValue(putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString()))
                setShowFileSplit(!showFileSplit)
            }
        })
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
                                            }
                                        ]})
                                }}
                                active={i === finalFileIndex}>{file.filename}</StyledFile>)})}</div>}
        <CodeMirrorWrapper mergeView={mergeView} mergeValue={mergeValue}
            identifier={`${stateIdentifier}${showFileSplit?'-'+finalFileIndex:''}`}
            onChange={(codeAsString)=>{
                let fullCodeAsString = putFilesTogether(files, finalFileIndex, codeAsString)

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
                if (onChange) {
                    if (isDataJson) {
                        // if input was an object output is an Object too
                        onChange(asJson)
                    } else {
                        onChange(fullCodeAsString)
                    }
                }
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
                        fileSplit,
                        clickEvent,
                        editorView,
                        propertyTemplates,
                        templates,
                        setEditData
                    }))
                }
            }}
            style={{height:renderInWindow ? '100%': (height ? height : '30rem')}}
            firstVisibleLine={scrollPositions[finalFileIndex] ? scrollPositions[finalFileIndex].firstVisibleLine : 0}
            value={finalValue}/>
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
        {editData && <SimpleDialog disablePortal={renderInWindow} fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
                                   onClose={(action) => {
                                       if (action.key === 'ok') {

                                           const formValidation = editDataFormRef.current.validate()
                                           if (formValidation.isValid) {
                                               if (editData.fileSplit) {
                                                   if(editData.file){
                                                       let content = putFilesTogether(files, finalFileIndex, editorViewRef.current.state.doc.toString())
                                                       const regex = new RegExp(`^${SPLIT_SIGN}${editData.file.filename}$`, 'gm');
                                                       setStateValue(content.replace(regex, SPLIT_SIGN+Util.escapeForJson(editDataFormRef.current.state.fields.name)))
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
                             data: {fullWidth: true,label: editData.key,uitype: editData.uitype}}}/></SimpleDialog>}
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
    return prev.identifier === next.identifier && prev.height === next.height
})