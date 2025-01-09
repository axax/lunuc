import React, {useState, useImperativeHandle, forwardRef, memo, useRef, useEffect} from 'react'
import CodeMirrorWrapper from './codemirror6/CodeMirrorWrapper'
import {SimpleMenu,SimpleDialog,LaunchIcon,ViewListIcon} from 'ui/admin'
import GenericForm from './GenericForm'
import RenderInNewWindow from './layout/RenderInNewWindow'
import {generateContextMenu} from './codemirror6/contextMenu'
import {replaceLineWithText, formatCode} from './codemirror6/utils'
import {StyledFile,seperateFiles,putFilesTogether} from './codemirror6/fileSeperation'
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


function CodeEditor(props,ref){
    const {mergeView, mergeValue, children, height, onScroll, onFileChange, showFab, fabButtonStyle, actions, onChange, onError, onBlur, lineNumbers, type, style, className, error, templates, propertyTemplates, fileSplit, identifier, readOnly} = props

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

    useEffect(() => {
        setStateValue(children || '')
        setStateIdentifier(identifier)
        return () => {}
    }, [identifier])



    let finalValue = isDataJson && stateValue.constructor !== String ? JSON.stringify(stateValue, null, 2) : stateValue
    const hasError = (error || stateError)

    console.log(`Render CodeEditor with height=${height || ''} and identifier=${stateIdentifier} fileIndex=${fileIndex}`)

    const allActions = [
        {
            icon: <ViewListIcon/>,
            name: _t('CodeEditor.reformatCode')+' (Alt-Cmd-L)',
            onClick: ()=>{formatCode(editorViewRef.current)}
        },
        {
            icon: <LaunchIcon/>,
            name: 'Open in new window',
            onClick: () => {
                setRenderInWindow(true)
            }
        },
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
        }
        allActions.push({
            name: (showFileSplit ? 'Hide' : 'Show') + ' File split', onClick: () => {
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
                if (type === 'json' || type === 'css') {
                    clickEvent.preventDefault()
                    setContextMenu(generateContextMenu({type,clickEvent,editorView,propertyTemplates,templates,setEditData}))
                }
            }}
            style={{height:height ? height : (renderInWindow ? '100%':'30rem')}}
            firstVisibleLine={scrollPositions[finalFileIndex] ? scrollPositions[finalFileIndex].firstVisibleLine : 0}
            value={finalValue}/>
        {showFab && <SimpleMenu key="menu" mini fab color="secondary" style={{
            zIndex: 999,
            position: 'absolute',
            bottom: '8px',
            right: '8px', ...fabButtonStyle
        }} items={allActions}/>}
        {contextMenu && contextMenu.items.length > 0 && <SimpleMenu anchorReference={"anchorPosition"} anchorPosition={contextMenu} noButton={true} open={contextMenu}
            onClose={() => {setContextMenu(false)}}
            mini items={contextMenu.items}/>}
        {hasError && <div style={{color: 'red'}}>{error ? error + ' ' : ''}{stateError ? stateError.message : ''}</div>}
        {editData && <SimpleDialog fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
                                   onClose={(action) => {
                                       if (action.key === 'ok') {
                                           const formValidation = editDataFormRef.current.validate()
                                           if (formValidation.isValid) {
                                               replaceLineWithText(editorViewRef.current, editData.lineData.number,`"${editData.key}":"${Util.escapeForJson(editDataFormRef.current.state.fields.data).replace(/\\/g, '\\\\\\')}"${editData.lineData.endsWithComma ? ',' : ''}`)
                                               formatCode(editorViewRef.current)
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
            <GenericForm ref={editDataFormRef} primaryButton={false} values={{data: editData.value}} fields={{
                             data: {fullWidth: true,label: editData.key,uitype: editData.uitype}}}/></SimpleDialog>}
    </StyledRoot>

    if(renderInWindow){
        return <RenderInNewWindow title="Code Editor" onClose={()=>{setRenderInWindow(false)}}>{comp}</RenderInNewWindow>
    }

    return comp
}

export default memo(forwardRef(CodeEditor), (prev, next)=>{
    return prev.identifier === next.identifier
})