import React from 'react'
import PropTypes from 'prop-types'
import Dialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    withMobileDialog,
} from 'material-ui/Dialog'
import Button from 'material-ui/Button'
import {withStyles} from 'material-ui/styles'

const styles = theme => ({
    paper: {
        overflow: 'visible'
    }
})

export const SimpleDialog = withMobileDialog()(({classes,children, onClose, actions, title, ...rest}) => {
    return <Dialog
        aria-labelledby="responsive-dialog-title"
        onClose={onClose}
        classes={{
            paper: classes.paper,
        }}
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

SimpleDialog.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(SimpleDialog)