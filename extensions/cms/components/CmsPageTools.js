import React, {useCallback, useEffect} from 'react'
import {_t} from '../../../util/i18n.mjs'
import styled from '@emotion/styled'
import theme from '../../../client/components/ui/impl/material/theme'
import ConsoleCapture from './ConsoleCapture'
import {getCircularReplacer} from '../../mailserver/util/index.mjs'
import ResizableDivider from "../../../client/components/ResizableDivider";
import {propertyByPath, setPropertyByPath} from "../../../client/util/json.mjs";
import {deepMerge} from "../../../util/deepMerge.mjs";


const StyledBox = styled.div`
    position: fixed;
    background:${theme.palette.grey[800]};
    height:auto; 
    z-index:1100;
    right:0;
    top: auto;
    bottom: 0;
`
const StyledButtonGroup = styled.div`
    border-bottom:'solid 1px #ffffff';
`
const StyledInfoBox = styled.div`
    width: 100%;
    height: ${({height})=> height}px;
    max-height: 80vh;
    border: 1px solid #333;
    padding: 0;
    font-family: monospace;
    white-space: pre-wrap;
    overflow-y: auto;
    background: #f4f4f4;`

const StyledButton = styled.button`
    color:${({ selected }) => selected ? 'black' : 'white'};
    background: ${({ selected }) => selected ? 'rgb(255,255,255)' : 'none'};
    border:none;
    border-radius: 0;
    padding: 2px 10px;
    margin-left: 1px;
    &:hover{
        background-color: ${({ selected }) => selected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)'};
    }`

export default function CmsPageTools(props){

    const [tab, setTab] = React.useState(props.tab)
    const [boxHeight, setBoxHeight] = React.useState(props.boxHeight || 200)


    const handleMessage = useCallback((event) => {
        if(event.data.key === 'aiassistent'){

            const template = JSON.parse(props.template)
            let path = event.data.path
            if(path.startsWith('template.')){
                path = path.substring(9)
            }
            let data = propertyByPath(path, template)
            let newData = event.data.data

            if(Array.isArray(newData)){
                if(newData.length === 1){
                    newData = newData[0]
                }
            }


            if(data){
                if(Array.isArray(data)) {
                    newData = [newData,...data]
                }else if(data.constructor === Object){
                    newData = deepMerge(newData,data)
                }else{
                    newData = data
                }
            }
            setPropertyByPath(newData, path, template)

            props.onTemplateChange(template,true)

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
    const aiAssistenUrl = `/system/aiassistent?preview=true&slug=${props.slug || ''}`
    return <StyledBox style={props.style}>
        {tab && <ResizableDivider direction="vertical" onResize={(newPosition)=>{
            const newHeight = Math.max(boxHeight - newPosition,50)
            setBoxHeight(newHeight)
            if(props.onBoxHeightChange){
                props.onBoxHeightChange(newHeight)
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
        {tab==='scope' && <StyledInfoBox height={boxHeight}>{JSON.stringify(_app_.JsonDom.scope, getCircularReplacer(), 2)}</StyledInfoBox>}
        {tab==='serverConsole' && <StyledInfoBox  height={boxHeight} style={{overflow:'hidden'}}><iframe src="/system/console?preview=true&embedded=true&cmd=luapi" style={{width:'100%', height:'100%', border:'none'}}/></StyledInfoBox>}
        {tab==='aiAssistent' && <StyledInfoBox  height={boxHeight} style={{overflow:'hidden'}}><iframe src={aiAssistenUrl} style={{width:'100%', height:'100%', border:'none'}}/></StyledInfoBox>}
    </StyledBox>

}
