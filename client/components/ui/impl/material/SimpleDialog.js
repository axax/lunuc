import React from 'react'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import Draggable from 'react-draggable'
import {_t} from '../../../../../util/i18n.mjs'


// lets the paper know that the dialog is maximized without swapping the
// PaperComponent - swapping it would remount the whole dialog content
const MaximizedContext = React.createContext(false)

function DraggablePaper(props) {
    // react-draggable needs a real DOM node ref, Paper forwards it
    const nodeRef = React.useRef(null)
    const maximized = React.useContext(MaximizedContext)
    return (
        <Draggable
            nodeRef={nodeRef}
            disabled={maximized}
            handle="#responsive-dialog-title"
            cancel={'[class*="MuiDialogContent-root"]'}>
            <Paper {...props} ref={nodeRef}/>
        </Draggable>
    )
}

/**
 * @param overflowVisible set to true only if a popper/menu inside the content
 *        must escape the dialog bounds. This disables content scrolling.
 * @param maximizable shows a button (and double click on the title) to
 *        toggle between windowed and fullscreen. Default true.
 */
export const SimpleDialog = ({
                                 children,
                                 onClose,
                                 actions,
                                 title,
                                 fullScreen,
                                 fullScreenMobile,
                                 overflowVisible,
                                 maximizable = true,
                                 ...rest
                             }) => {
    const theme = useTheme()

    // hooks must never be called conditionally
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const fullScreenByProps = fullScreenMobile ? isMobile : !!fullScreen
    // user toggled maximize - only relevant when not fullscreen anyway
    const [maximized, setMaximized] = React.useState(false)
    const canMaximize = maximizable && !fullScreenByProps
    const fullScreenFinal = fullScreenByProps || (canMaximize && maximized)
    const toggleMaximized = () => {
        setMaximized(m => !m)
        // editors like TinyMCE/CodeMirror measure on window resize
        setTimeout(() => window.dispatchEvent(new Event('resize')), 0)
    }

    // dragging a fullscreen dialog makes no sense and the transform breaks
    // position:fixed children, so only use the draggable paper when windowed
    const paperComponent = fullScreenByProps ? Paper : DraggablePaper

    return <MaximizedContext.Provider value={fullScreenFinal}><Dialog
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
                    borderRadius: 0,
                    // a drag offset would move the maximized dialog off screen
                    // and a transform breaks position:fixed children
                    transform: 'none !important'
                }
            })
        }}
        {...rest}>
        <DialogTitle
            style={fullScreenFinal ? undefined : {cursor: 'move'}}
            sx={canMaximize ? {pr: 7} : undefined}
            onDoubleClick={canMaximize ? toggleMaximized : undefined}
            id="responsive-dialog-title">
            {title}
            {canMaximize && <Tooltip title={_t(maximized ? 'SimpleDialog.restore' : 'SimpleDialog.maximize')}>
                <IconButton
                    aria-label={_t(maximized ? 'SimpleDialog.restore' : 'SimpleDialog.maximize')}
                    onClick={toggleMaximized}
                    // keep react-draggable from starting a drag on the button
                    onMouseDown={e => e.stopPropagation()}
                    size="small"
                    sx={{position: 'absolute', right: 16, top: 16}}>
                    {maximized ? <CloseFullscreenIcon fontSize="small"/> : <OpenInFullIcon fontSize="small"/>}
                </IconButton>
            </Tooltip>}
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
                        <Button autoFocus={action.autoFocus} disabled={!!action.disabled} onClick={() => {
                            onClose(action)
                        }} color={action.type} variant={action.variant} size={action.size}>
                            {action.label}
                        </Button>
                    </React.Fragment>
                })}
            </DialogActions>
            : null}
    </Dialog></MaximizedContext.Provider>
}

export default SimpleDialog