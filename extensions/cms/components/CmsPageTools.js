import React from 'react'
import {_t} from '../../../util/i18n.mjs'
import styled from '@emotion/styled'
import theme from '../../../client/components/ui/impl/material/theme'
import ConsoleCapture from './ConsoleCapture'
import {getCircularReplacer} from '../../mailserver/util/index.mjs'
import ResizableDivider from "../../../client/components/ResizableDivider";


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

    const [tab, setTab] = React.useState(false)
    const [boxHeight, setBoxHeight] = React.useState(props.boxHeight || 200)

   /* const hiddeAll = ()=>{
        setShowConsole(false)
        setShowScope(false)
        setShowServerConsole(false)
        setShowAiAssistent(false)
    }*/
    const toggleTab = (name)=>{
        if(tab===name){
            setTab(false)
        }else{
            setTab(name)
        }
    }
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
                AI Assistent
            </StyledButton>
        </StyledButtonGroup>
        {tab==='console' && <StyledInfoBox height={boxHeight}><ConsoleCapture /></StyledInfoBox>}
        {tab==='scope' && <StyledInfoBox height={boxHeight}>{JSON.stringify(_app_.JsonDom.scope, getCircularReplacer(), 2)}</StyledInfoBox>}
        {tab==='serverConsole' && <StyledInfoBox  height={boxHeight} style={{overflow:'hidden'}}><iframe src="/system/console?preview=true&embedded=true&cmd=luapi" style={{width:'100%', height:'100%', border:'none'}}/></StyledInfoBox>}
        {tab==='aiAssistent' && <StyledInfoBox  height={boxHeight} style={{overflow:'hidden'}}><iframe src="/system/aiassistent?preview=true" style={{width:'100%', height:'100%', border:'none'}}/></StyledInfoBox>}
    </StyledBox>

}
