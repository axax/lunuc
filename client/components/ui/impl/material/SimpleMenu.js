import React from 'react'
import PropTypes from 'prop-types'
import Button from '@material-ui/core/Button'
import Fab from '@material-ui/core/Fab'
import Menu from '@material-ui/core/Menu'
import MenuItem from '@material-ui/core/MenuItem'
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MoreVertIcon from '@material-ui/icons/MoreVert'
import IconButton from '@material-ui/core/IconButton'

class SimpleMenu extends React.Component {
    state = {
        anchorEl: null,
    }

    handleClick = event => {
        event.stopPropagation()
        this.setState({anchorEl: event.currentTarget})
        return false
    }

    handleClose = () => {
        this.setState({anchorEl: null})
    }

    render() {
        const {anchorEl} = this.state
        const {style, items, label, mini, color, fab, onClick} = this.props
        return (
            <div style={style}>
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
                    open={Boolean(anchorEl)}
                    onClose={this.handleClose}
                >
                    {items.map((item, i) => {
                        return <MenuItem onClick={(e) => {
                            this.handleClose();
                            item.onClick(e)
                        }} key={i}>
                            {item.icon &&
                            <ListItemIcon>
                                {item.icon}
                            </ListItemIcon>
                            }
                            <ListItemText>
                                {item.name}
                            </ListItemText>
                        </MenuItem>
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
    color: PropTypes.string
}

export default SimpleMenu