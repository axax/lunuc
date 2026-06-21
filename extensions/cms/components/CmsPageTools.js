import React, {useCallback, useEffect} from 'react'
import {_t} from '../../../util/i18n.mjs'
import styled from '@emotion/styled'
import {alpha} from '@mui/material/styles'
import ConsoleCapture from './ConsoleCapture'
import ResizableDivider from '../../../client/components/ResizableDivider'
import {propertyByPath} from '../../../client/util/json.mjs'
import JsonViewer from './JsonViewer'


const StyledBox = styled('div')(({theme}) => ({
    position: 'fixed',
    right: 0,
    bottom: 0,
    top: 'auto',
    height: 'auto',
    zIndex: 1100,
    background: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    borderLeft: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[6],
    overflow: 'hidden'
}))

const StyledButtonGroup = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.75, 1),
    background: theme.palette.background.default,
    borderBottom: `1px solid ${theme.palette.divider}`
}))

const StyledInfoBox = styled('div')(({theme, height}) => ({
    width: '100%',
    height: `${height}px`,
    maxHeight: '80vh',
    padding: 0,
    fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    // theme-consistent scrollbar
    '&::-webkit-scrollbar': {width: 6, height: 6},
    '&::-webkit-scrollbar-track': {background: 'transparent'},
    '&::-webkit-scrollbar-thumb': {
        background: theme.palette.grey[300],
        borderRadius: 99,
        '&:hover': {background: theme.palette.grey[400]}
    }
}))

const StyledButton = styled('button')(({theme, selected}) => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '0.01em',
    cursor: 'pointer',
    border: 'none',
    borderRadius: theme.shape.borderRadius - 4,
    padding: theme.spacing(0.6, 1.75),
    transition: 'all 0.15s ease',
    color: selected ? theme.palette.primary.contrastText : theme.palette.text.secondary,
    background: selected
        ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
        : 'transparent',
    boxShadow: selected ? theme.shadows[2] : 'none',
    '&:hover': {
        color: selected ? theme.palette.primary.contrastText : theme.palette.primary.main,
        background: selected
            ? `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
            : alpha(theme.palette.primary.main, 0.08)
    }
}))

export default function CmsPageTools(props){

    const [tab, setTab] = React.useState(props.tab)
    const [boxHeight, setBoxHeight] = React.useState(props.boxHeight || 200)


    const handleMessage = useCallback((event) => {
        if(event.data.lunuc_component && event.data.key) {

            if(event.data.key==='template') {
                if(event.data.data || event.data.operation === 'remove') {
                    let template
                    if(event.data.path) {
                        template = JSON.parse(props.data.template)
                        if(!Array.isArray(template)){
                            template = [template]
                        }
                        let path = event.data.path
                        if (path.startsWith('template.')) {
                            path = path.substring(9)
                        }
                        let data = propertyByPath(path, template)
                        let newData = event.data.data

                        if (Array.isArray(newData)) {
                            if (newData.length === 1) {
                                newData = newData[0]
                            }
                        }
                        let parentPath = path.slice(0, path.lastIndexOf('.'))
                        if (parentPath.endsWith('.c')) {
                            parentPath = parentPath.substring(0, parentPath.lastIndexOf('.'))
                        }
                        const parentData = propertyByPath(parentPath, template)
                        if (parentData) {
                            if (event.data.operation === 'remove') {
                                if (Array.isArray(parentData.c)) {
                                    const index = parentData.c.indexOf(data)
                                    if (index > -1) {
                                        parentData.c.splice(index, 1)
                                    }
                                } else {
                                    parentData.c = {}
                                }
                            } else if (event.data.operation === 'add') {
                                let arr
                                if (Array.isArray(parentData)) {
                                    arr = parentData
                                }else if (!Array.isArray(parentData.c)) {
                                    parentData.c = [parentData.c]
                                    arr = parentData.c
                                }else{
                                    arr = parentData.c
                                }

                                let index = arr.indexOf(data)
                                if (index < 0) {
                                    index = 0
                                }
                                if (event.data.location === 'before') {
                                    arr.splice(index, 0, newData)
                                } else {
                                    arr.splice(index < arr.length - 1 ? index + 1 : index, 0, newData)
                                }
                            } else if (event.data.operation === 'update') {
                                if (Array.isArray(parentData.c)) {
                                    const index = parentData.c.indexOf(data)
                                    if (index > -1) {
                                        parentData.c[index] = newData
                                    }
                                } else {
                                    parentData.c = newData
                                }
                            }
                        }
                    }else{
                        template = event.data.data
                    }
                    props.onTemplateChange(template, true)
                }
            }else{

                let newData
                if(event.data.old_data){
                    const currentData = props.data[event.data.key]
                    if(currentData){
                        newData = currentData.replace(event.data.old_data, event.data.data)
                    }
                }else{
                    newData = event.data.data
                }

                props.setCmsPageValue({key:event.data.key, forceUpdateEditor:true},newData)
            }
            // Optionally verify event.origin here for security
            console.log("Received data from iframe:", event.data);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('message', handleMessage)
        // Cleanup to remove the listener when the component unmounts
        return () => {
            window.removeEventListener('message', handleMessage)
        }
    }, [handleMessage])


    /* const hiddeAll = ()=>{
         setShowConsole(false)
         setShowScope(false)
         setShowServerConsole(false)
         setShowAiAssistent(false)
     }*/
    const toggleTab = (name)=>{
        let newTab = name
        if(tab===newTab){
            newTab = false
        }
        setTab(newTab)

        if(props.onTab){
            props.onTab(newTab)
        }
    }
    const aiAssistenUrl = `/system/aiassistent?preview=true&slug=${props.data.slug || ''}`
    return <StyledBox style={props.style}>
        {tab && <ResizableDivider direction="vertical" onResize={(newPosition)=>{
            const newHeight = Math.max(boxHeight - newPosition,50)
            setBoxHeight(newHeight)
            if(props.onBoxHeightChange){
                clearTimeout(this.timeout)
                this.timeout = setTimeout(()=>{
                    props.onBoxHeightChange(newHeight)
                },50)

            }
        }}/>}
        <StyledButtonGroup>
            <StyledButton selected={tab === 'console'} onClick={() => toggleTab('console')}>
                Console
            </StyledButton>
            <StyledButton selected={tab === 'scope'} onClick={() => toggleTab('scope')}>
                Scope
            </StyledButton>
            <StyledButton selected={tab === 'serverConsole'} onClick={() => toggleTab('serverConsole')}>
                Server Console
            </StyledButton>
            <StyledButton selected={tab === 'aiAssistent'} onClick={() => toggleTab('aiAssistent')}>
                {_t('CodeEditor.aiAssistent')}
            </StyledButton>
        </StyledButtonGroup>
        {tab==='console' && <StyledInfoBox height={boxHeight}><ConsoleCapture /></StyledInfoBox>}
        {tab==='scope' && <StyledInfoBox height={boxHeight}><JsonViewer json={_app_.JsonDom.scope} />
        </StyledInfoBox>}
        {tab==='serverConsole' && <StyledInfoBox  height={boxHeight} style={{overflow:'hidden'}}><iframe src="/system/console?preview=true&embedded=true&cmd=luapi" style={{width:'100%', height:'100%', border:'none'}}/></StyledInfoBox>}
        {tab==='aiAssistent' && <StyledInfoBox  height={boxHeight} style={{overflow:'hidden'}}><iframe src={aiAssistenUrl} style={{width:'100%', height:'100%', border:'none'}}/></StyledInfoBox>}
    </StyledBox>

}
