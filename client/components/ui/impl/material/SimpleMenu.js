import React from 'react'
import PropTypes from 'prop-types'
import Button from '@material-ui/core/Button'
import Divider from '@material-ui/core/Divider'
import Fab from '@material-ui/core/Fab'
import Menu from '@material-ui/core/Menu'
import MenuItem from '@material-ui/core/MenuItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import MoreVertIcon from '@material-ui/icons/MoreVert'
import IconButton from '@material-ui/core/IconButton'

class SimpleMenu extends React.Component {
    state = {
        anchorEl: null,
    }

    handleClick = e => {
        e.stopPropagation()
        this.setState({anchorEl: e.currentTarget})
        if( this.props.onOpen ){
            this.props.onOpen()
        }
        return false
    }

    handleClose = e => {
        e.stopPropagation()
        this.setState({anchorEl: null})
        if( this.props.onClose ){
            this.props.onClose()
        }
        return false
    }

    render() {
        const {anchorEl} = this.state
        const {style, items, label, mini, color, fab, onClick, className,open,onOpen,...rest} = this.props
        return (
            <div className={className} style={style}>
                {
                    label !== undefined || fab !== undefined ?
                        fab ?
                            <Fab aria-label="Simple menu"
                                 size={mini ? 'small' : 'medium'}
                                 color={color}
                                 aria-owns={anchorEl ? 'simple-menu' : null}
                                 aria-haspopup="true"
                                 onClick={this.handleClick}>
                                {label ? label : <MoreVertIcon /> }
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
                                {label ? label : <MoreVertIcon /> }

                            </Button>
                        :
                        <IconButton
                            aria-label="Simple menu"
                            color={color}
                            aria-owns={anchorEl ? 'simple-menu' : null}
                            aria-haspopup="true"
                            onClick={this.handleClick}
                        >
                            <MoreVertIcon />

                        </IconButton>
                }
                <Menu
                    id="simple-menu"
                    anchorEl={anchorEl}
                    open={open!==undefined?!!open:Boolean(anchorEl)}
                    onClose={this.handleClose}
                    {...rest}
                >
                    {items.map((item, i) => {
                        return [item.divider && <Divider key={'divider' + i} light />,<MenuItem disabled={item.disabled} onClick={(e) => {
                            item.onClick(e)
                            this.handleClose(e)
                        }} key={'menuitem' + i}>
                            {item.icon &&
                            <ListItemIcon>
                                {item.icon}
                            </ListItemIcon>
                            }
                            <ListItemText>
                                {item.name}
                            </ListItemText>
                        </MenuItem>]
                    })}

                </Menu>
            </div>
        )
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
