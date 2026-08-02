import React from 'react'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Button from '@mui/material/Button'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import Draggable from 'react-draggable'


function DraggablePaper(props) {
    // react-draggable needs a real DOM node ref, Paper forwards it
    const nodeRef = React.useRef(null)
    return (
        <Draggable
            nodeRef={nodeRef}
            handle="#responsive-dialog-title"
            cancel={'[class*="MuiDialogContent-root"]'}>
            <Paper {...props} ref={nodeRef}/>
        </Draggable>
    )
}

/**
 * @param overflowVisible set to true only if a popper/menu inside the content
 *        must escape the dialog bounds. This disables content scrolling.
 */
export const SimpleDialog = ({
                                 children,
                                 onClose,
                                 actions,
                                 title,
                                 fullScreen,
                                 fullScreenMobile,
                                 overflowVisible,
                                 ...rest
                             }) => {
    const theme = useTheme()

    // hooks must never be called conditionally
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const fullScreenFinal = fullScreenMobile ? isMobile : !!fullScreen

    // dragging a fullscreen dialog makes no sense and the transform breaks
    // position:fixed children, so only use the draggable paper when windowed
    const paperComponent = fullScreenFinal ? Paper : DraggablePaper

    return <Dialog
        aria-labelledby="responsive-dialog-title"
        onClose={onClose}
        disableEnforceFocus={true}
        scroll="paper"
        fullScreen={fullScreenFinal}
        PaperComponent={paperComponent}
        sx={{
            zIndex: 9999,
            ...(fullScreenFinal && {
                // iOS: 100% of the fixed container can exceed the visible area
                '& .MuiDialog-paper': {
                    width: '100%',
                    maxWidth: '100%',
                    height: ['100vh', '100dvh'],
                    maxHeight: '100%',
                    margin: 0,
                    borderRadius: 0
                }
            })
        }}
        {...rest}>
        <DialogTitle
            style={fullScreenFinal ? undefined : {cursor: 'move'}}
            id="responsive-dialog-title">
            {title}
        </DialogTitle>
        <DialogContent
            dividers={fullScreenFinal}
            sx={overflowVisible ? {overflow: 'visible'} : {overflowY: 'auto', WebkitOverflowScrolling: 'touch'}}>
            {!children || children.constructor === String ?
                <DialogContentText>
                    {children || 'Content missing'}
                </DialogContentText>
                : children}
        </DialogContent>
        {actions ?
            <DialogActions>
                {actions.map((action, i) => {
                    if (!action) {
                        return null
                    }
                    return <React.Fragment key={i}>
                        {action.divider && <div style={{flex: '1 0 0'}}/>}
                        <Button autoFocus={action.autoFocus} onClick={() => {
                            onClose(action)
                        }} color={action.type} variant={action.variant} size={action.size}>
                            {action.label}
                        </Button>
                    </React.Fragment>
                })}
            </DialogActions>
            : null}
    </Dialog>
}

export default SimpleDialog