import React from 'react'
import PropTypes from 'prop-types'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'
import withMobileDialog from '@material-ui/core/withMobileDialog'
import Button from '@material-ui/core/Button'
import {withStyles} from '@material-ui/core/styles'
import {openWindow} from '../../../../util/window'

const styles = theme => ({
    root: {
        /*zIndex: '9999 !important'*/
    },
    paper: {
        overflow: 'visible'
    },
    contentRoot: {
        overflow: 'visible'
    }
})

export const SimpleDialog = withMobileDialog()(({classes, children, onClose, actions, title, ...rest}) => {
    return <Dialog
        aria-labelledby="responsive-dialog-title"
        onClose={onClose}
        disableEnforceFocus={true}
        classes={{
            root: classes.root,
            paper: classes.paper,
        }}
        scroll="body"
        {...rest}>
        <DialogTitle id="responsive-dialog-title">{title}</DialogTitle>
        <DialogContent
            classes={{
                root: classes.contentRoot
            }}>
            {children.constructor === String ?
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
                            if(action.url){
                                openWindow(action)
                            }
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
