import styled from '@emotion/styled'
import {DROPAREA_ACTIVE, DROPAREA_OVER, DROPAREA_OVERLAP} from '../../util/jsonDomDragUtil'
import {SimpleMenu} from '../../../../client/components/ui/impl/material'


export const StyledHighlighter = styled('span')(({ color, selected }) => ({
    zIndex: 999,
    position: 'fixed',
    bottom: 0,
    left: 0,
    minWidth: '10px',
    minHeight: '10px',
    display: 'flex',
    border: '1px dashed rgba(0,0,0,0.3)',
    pointerEvents: 'none',
    justifyContent: 'center',
    alignItems: 'center',
    ...(selected && {
        border: '2px solid #8b3dff',
    }),
    ...(color==='yellow' && {
        background: 'rgba(245, 245, 66,0.05)',
        boxShadow: '0px 0px 6px 2px rgba(0,0,0,0.4), 0px 0px 5px 0px rgba(235,252,0,1)'
    }),
    ...(color==='red' && {
        background: 'rgba(245, 66, 66,0.1)',
        boxShadow: '0px 0px 6px 2px rgba(0,0,0,0.2), 0px 0px 5px 0px rgba(245, 66, 66,1)'
    }),
    ...(color==='blue' && {
        boxShadow: '0px 0px 6px 2px rgba(0,0,0,0.4), 0px 0px 5px 0px rgba(84, 66, 245,1)',
        background: 'rgba(84, 66, 245,0.1)',
        color: 'black',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        textShadow: '1px 1px 2px white'
    }),
}))

export const StyledDropArea = styled('span')({
    transition: 'visibility .5s ease-out, opacity .5s ease-out',
    opacity: 0,
    zIndex: 999,
    display: 'flex',
    justifyContent:'center',
    alignItems:'center',
    visibility: 'hidden',
    position: 'absolute',
    fontWeight: 'normal',
    borderRadius: '5px',
    background: '#000000',
    padding: '5px',
    maxWidth: '100%',
    margin: '-28px 0 0 0 !important',
    border: '1px dashed #c1c1c1',
    height: '32px',
    color: '#fff',
    textAlign: 'center',
    fontSize: '0.9rem',
    '> span':{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    /*'&:after': {
        top: '100%',
        left: '50%',
        border: 'solid transparent',
        content: '""',
        height: 0,
        width: 0,
        position: 'absolute',
        pointerEvents: 'none',
        borderColor: 'rgba(0, 0, 0, 0)',
        borderTopColor: '#000',
        borderWidth: '10px',
        marginLeft: '-10px'
    },*/
    [`&.${DROPAREA_ACTIVE}`]:{
        visibility: 'visible',
        opacity: 0.8
    },
    [`&.${DROPAREA_OVERLAP}`]:{
        opacity: 0.3,
        height: '24px',
        marginTop:'10px',
        fontSize: '0.8rem',
       /* position: 'relative',
        marginTop: '0px !important'*/
    },
    [`&.${DROPAREA_OVER}`]:{
        zIndex: 1000,
        opacity: '1 !important',
        visibility: 'visible !important',
        background: 'red',
        '&:after': {
            borderTopColor: 'red'
        }
    },
    [`*`]:{
        pointerEvents: 'none'
    }
})


export const StyledPicker = styled('div')({
    cursor: 'pointer',
    pointerEvents: 'auto'
})

export const StyledToolbarButton = styled('div')({
    zIndex: 998,
    position: 'fixed',
    maxHeight: '200px'
})

export const StyledToolbarMenu = styled(SimpleMenu)({
    position: 'absolute',
    left: '-2.2rem',
    top: 'calc(50% - 1.5rem)'
})

export const StyledRichTextBar = styled('div')({
    pointerEvents: 'auto',
    zIndex:1003,
    top:'-4rem',
    left:0,
    right:0,
    position:'absolute',
    height:'4rem',
    width:'100%',
    '> div':{
        backgroundColor:'rgba(255,255,255,0)',
    },
    '> div > div':{
        borderRadius:'0.5rem',
        boxShadow: 'rgba(50, 50, 93, 0.25) 0px 2px 5px -1px, rgba(0, 0, 0, 0.3) 0px 1px 3px -1px;'
    }
})

export const StyledInfoBox = styled('div')({
    position: 'absolute',
    pointerEvents: 'none',
    top:'-15px',
    color:'#ffffff',
    background: '#000000',
    padding: '2px 3px',
    fontSize:'10px',
    lineHeight:1,
    zIndex: 1001,
    whiteSpace:'nowrap'
})

export const StyledHorizontalDivider = styled('div')({
    position: 'absolute',
    height: '4px',
    width:'100%',
    pointerEvents: 'auto',
    fontSize:'0.8rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color:'rgb(100,100,100)',
    background: 'rgba(66, 164, 245,0.09)',
    /*borderBottom:'solid 2px #000000',*/
    right: 0,
    top: '100%',
    left: 0,
    cursor: 'ns-resize',
    zIndex: 1002,
    overflow:'hidden'
})

export const StyledVerticalDivider = styled('div')({
    position: 'absolute',
    height: '4px',
    width:'100%',
    pointerEvents: 'auto',
    fontSize:'0.8rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color:'rgb(100,100,255)',
    background: 'rgba(66, 164, 245,0.09)',
    /*borderBottom:'solid 2px #000000',*/
    right: 0,
    top: '100%',
    left: 0,
    cursor: 'ns-resize',
    zIndex: 1002,
})