import React from 'react'
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    withMobileDialog,
} from 'material-ui/Dialog'
import Button from 'material-ui/Button'


export const SimpleDialog = withMobileDialog()(({children, onClose, actions, title, ...rest}) => {
    return <Dialog
        aria-labelledby="responsive-dialog-title"
        onClose={onClose}
        {...rest}>
        <DialogTitle id="responsive-dialog-title">{title}</DialogTitle>
        <DialogContent>
            { children.constructor === String ?
                <DialogContentText>
                    {children}
                </DialogContentText>
                : children}
        </DialogContent>
        {actions ?
            <DialogActions>
                {actions.map((action, i) => {
                    return (
                        <Button key={i} onClick={() => {
                            onClose(action)
                        }} color={action.type}>
                            {action.label}
                        </Button>
                    )
                })}
            </DialogActions>
            : ''}
    </Dialog>
})

export default SimpleDialog
