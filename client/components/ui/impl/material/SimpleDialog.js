import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Button from '@mui/material/Button'
import useMediaQuery from '@mui/material/useMediaQuery'
import theme from './theme'


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
        {...rest}>
        <DialogTitle id="responsive-dialog-title">{title}</DialogTitle>
        <DialogContent sx={{overflow: 'visible'}}>
            {children && children.constructor === String ?
                <DialogContentText>
                    {children}
                </DialogContentText>
                : children}
        </DialogContent>
        {actions ?
            <DialogActions>
                {actions.map((action, i) => {
                    return (
                        <Button autoFocus={action.autoFocus} key={i} onClick={() => {
                            onClose(action)
                        }} color={action.type}>
                            {action.label}
                        </Button>
                    )
                })}
            </DialogActions>
            : ''}
    </Dialog>
}

export default SimpleDialog
