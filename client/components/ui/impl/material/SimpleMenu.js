import React from 'react'
import PropTypes from 'prop-types'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Fab from '@mui/material/Fab'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import List from '@mui/material/List'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import Avatar from '@mui/material/Avatar'
import {getIconByKey} from './icon'

class SimpleMenu extends React.Component {
    state = {
        anchorEl: null,
        collapse: {}
    }

    menuAction = React.createRef()
    resizeObserver = null

    // MUI positions the popover only once when it opens. If the content size changes afterwards
    // (lazy loaded icons, web fonts, expanded sub items) the menu can end up partially outside the viewport.
    // Observe the paper and reposition whenever its size changes.
    observePaper = (element) => {
        this.disconnectObserver()
        if (element && typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.menuAction.current?.updatePosition()
            })
            this.resizeObserver.observe(element)
        }
    }

    disconnectObserver = () => {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
            this.resizeObserver = null
        }
    }

    componentWillUnmount() {
        this.disconnectObserver()
    }

    handleClick = e => {
        e.stopPropagation()
        this.setState({anchorEl: e.currentTarget})
        if (this.props.onOpen) {
            this.props.onOpen()
        }
        return false
    }

    handleClose = e => {
        e.stopPropagation()
        this.setState({anchorEl: null})
        if (this.props.onClose) {
            this.props.onClose()
        }
        return false
    }

    render() {
        const {anchorEl} = this.state
        const {style, items, label, mini, color, fab, icon, onClick, className, open, onOpen, noButton, zIndex, ...rest} = this.props
        return (
            <div className={className} style={style}>
                {
                    noButton ? null :
                    label !== undefined || fab !== undefined ?
                        fab ?
                            <Fab aria-label="Simple menu"
                                 size={mini ? 'small' : 'medium'}
                                 color={color}
                                 aria-owns={anchorEl ? 'simple-menu' : null}
                                 aria-haspopup="true"
                                 onClick={this.handleClick}>
                                {label ? label : (icon || <MoreVertIcon/>)}
                            </Fab>
                            :
                            <Button
                                aria-label="Simple menu"
                                variant='flat'
                                size={mini ? 'small' : 'medium'}
                                color={color}
                                aria-owns={anchorEl ? 'simple-menu' : null}
                                aria-haspopup="true"
                                onClick={this.handleClick}
                            >
                                {label ? label : (icon || <MoreVertIcon/>)}

                            </Button>
                        :
                        <IconButton
                            aria-label="Simple menu"
                            color={color}
                            aria-owns={anchorEl ? 'simple-menu' : null}
                            aria-haspopup="true"
                            onClick={this.handleClick}
                        >
                            {(icon || <MoreVertIcon/>)}

                        </IconButton>
                }
                <Menu
                    id="simple-menu"
                    anchorEl={anchorEl}
                    open={open !== undefined ? !!open : Boolean(anchorEl)}
                    onClose={this.handleClose}
                    action={this.menuAction}
                    {...rest}
                    slotProps={{
                        ...rest.slotProps,
                        root: {
                            // z-index must be on the modal root, the paper is inside its stacking context
                            style: {zIndex: zIndex ? zIndex: 9999},
                            ...rest.slotProps?.root
                        },
                        transition: {
                            ...rest.slotProps?.transition,
                            onEntering: (element, isAppearing) => {
                                this.observePaper(element)
                                rest.slotProps?.transition?.onEntering?.(element, isAppearing)
                            },
                            onExited: (element) => {
                                this.disconnectObserver()
                                rest.slotProps?.transition?.onExited?.(element)
                            }
                        }
                    }}
                >
                    {this.renderMenu(items)}

                </Menu>
            </div>
        )
    }

    renderMenu(items, intent=0){
        const {collapse} = this.state
        const {avatarIcon, onClick} = this.props

        const style = {}

        if(intent>0){
            style.paddingLeft = (intent*2.5)+'rem'
        }
        return items.map((item, i) => {
            if(!item || item.hide) return
            let icon = getIconByKey(item.icon)
            if(item.icon) {
                if (typeof item.icon === 'string') {
                    const Icon = getIconByKey(item.icon)
                    if(Icon) {
                        icon = <Icon></Icon>
                    }
                }else{
                    icon = item.icon
                }
            }
            return [item.divider && <Divider key={'divider' + i} light/>,
                <MenuItem disabled={item.disabled} style={style}
                  sx={item.danger ? { color: 'error.main' } : {}}
                  onClick={(e) => {
                    if (item.items) {
                        // repositioning of the menu is handled by the ResizeObserver (see observePaper)
                        this.setState({collapse: { ...collapse, [i]: {open: !(collapse[i] && collapse[i].open) }}})
                    } else if (item.onClick) {
                        item.onClick(e, this.props.payload, item)
                        this.handleClose(e)
                    }else if(onClick) {
                        onClick(e, this.props.payload, item)
                        this.handleClose(e)
                    }
                }} key={'menuitem' + i}>
                    {icon && (
                        avatarIcon ?
                            <ListItemAvatar>
                                <Avatar
                                    sx={{ width: 32, height: 32, bgcolor: '#000' }}>
                                    {icon}
                                </Avatar>
                            </ListItemAvatar>
                            :
                    <ListItemIcon>
                        {icon}
                    </ListItemIcon>
                        )
                    }
                    {item.component}
                    {item.name &&
                    <ListItemText>
                        {item.name}
                    </ListItemText>
                    }
                    {item.items ? collapse[i] && collapse[i].open ? <ExpandLess/> : <ExpandMore/> : null}
                </MenuItem>, item.items &&
                <Collapse in={collapse[i] && collapse[i].open} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                        {this.renderMenu(item.items, intent+1)}
                    </List>
                </Collapse>]
        })
    }
}


SimpleMenu.propTypes = {
    items: PropTypes.array.isRequired,
    style: PropTypes.object,
    label: PropTypes.string,
    mini: PropTypes.bool,
    fab: PropTypes.bool,
    open: PropTypes.any,
    color: PropTypes.string,
    onOpen: PropTypes.func,
    onClose: PropTypes.func
}

export default SimpleMenu