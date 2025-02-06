import React from 'react'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Button from '@mui/material/Button'
import useMediaQuery from '@mui/material/useMediaQuery'
import theme from './theme'
import FocusTrap from '@mui/material/Unstable_TrapFocus/FocusTrap'
import Draggable from 'react-draggable'


function PaperComponent(props) {
    const nodeRef = React.useRef(null);
    return (
        <Draggable
            nodeRef={nodeRef}
            handle="#responsive-dialog-title"
            cancel={'[class*="MuiDialogContent-root"]'}>
            <Paper {...props} ref={nodeRef} />
        </Draggable>
    );
}

export const SimpleDialog = ({children, onClose, actions, title, fullScreen, fullScreenMobile, ...rest}) => {
    const fullScreenFinal = fullScreenMobile ? useMediaQuery(theme.breakpoints.down('md')): fullScreen
    console.log('render SimpleDialog')
    return <Dialog
        aria-labelledby="responsive-dialog-title"
        onClose={onClose}
        disableEnforceFocus={true}
        PaperProps={{sx: { overflow: 'visible' } }}
        sx={{zIndex: '9999 !important'}}
        scroll="body"
        fullScreen={fullScreenFinal}
        PaperComponent={PaperComponent}
        {...rest}>
        <DialogTitle style={{ cursor: 'move' }} id="responsive-dialog-title">{title}</DialogTitle>
        <DialogContent sx={{overflow: 'visible'}}>
            <FocusTrap>{!children || children.constructor === String ?
                <DialogContentText>
                    {children || 'Content missing'}
                </DialogContentText>
                : children}
            </FocusTrap>
        </DialogContent>
        {actions ?
            <DialogActions>
                {actions.map((action, i) => {
                    if(!action){
                        return null
                    }
                    return <>
                        {action.divider && <div style={{flex: '1 0 0'}} />}
                        <Button autoFocus={action.autoFocus} key={i} onClick={() => {
                            onClose(action)
                        }} color={action.type} variant={action.variant} size={action.size}>
                            {action.label}
                        </Button></>
                })}
            </DialogActions>
            : ''}
    </Dialog>
}

export default SimpleDialog
