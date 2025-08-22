import React from 'react'
import {_t} from '../../../util/i18n.mjs'
import styled from '@emotion/styled'
import theme from '../../../client/components/ui/impl/material/theme'
import ConsoleCapture from './ConsoleCapture'
import {getCircularReplacer} from '../../mailserver/util/index.mjs'


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
    height: 30vh;
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

    const {onChange, cmsPage, style} = props

    const [showScope, setShowScope] = React.useState(false)
    const [showConsole, setShowConsole] = React.useState(false)
    const [showServerConsole, setShowServerConsole] = React.useState(false)
    const [showAiAssistent, setShowAiAssistent] = React.useState(false)

   /* const hiddeAll = ()=>{
        setShowConsole(false)
        setShowScope(false)
        setShowServerConsole(false)
        setShowAiAssistent(false)
    }*/
    return <StyledBox style={props.style}>
        <StyledButtonGroup>
            <StyledButton selected={showConsole} onClick={() => setShowConsole(!showConsole)}>
                Console
            </StyledButton>
            <StyledButton selected={showScope} onClick={() => setShowScope(!showScope)}>
                Scope
            </StyledButton>
            <StyledButton selected={showServerConsole} onClick={() => setShowServerConsole(!showServerConsole)}>
                Server Console
            </StyledButton>
            <StyledButton selected={showAiAssistent} onClick={() => setShowAiAssistent(!showAiAssistent)}>
                AI Assistent
            </StyledButton>
        </StyledButtonGroup>
        {showConsole && <StyledInfoBox><ConsoleCapture /></StyledInfoBox>}
        {showScope && <StyledInfoBox>{JSON.stringify(_app_.JsonDom.scope, getCircularReplacer(), 2)}</StyledInfoBox>}
        {showServerConsole && <iframe src="/system/console?preview=true&embedded=true&cmd=luapi" style={{width:'100%', height:'100%', border:'none'}}/>}
        {showAiAssistent && <iframe src="/system/aiassistent?preview=true" style={{width:'100%', height:'100%', border:'none'}}/>}
    </StyledBox>

}
