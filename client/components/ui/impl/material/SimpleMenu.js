import React from 'react'
import PropTypes from 'prop-types'
import Button from 'material-ui/Button'
import Menu, { MenuItem } from 'material-ui/Menu'
import MoreVertIcon from 'material-ui-icons/MoreVert'

class SimpleMenu extends React.Component {
    state = {
        anchorEl: null,
    };

    handleClick = event => {
        this.setState({ anchorEl: event.currentTarget })
    };

    handleClose = () => {
        this.setState({ anchorEl: null })
    };

    render() {
        const { anchorEl } = this.state
        const { style,items } = this.props

        return (
            <div style={style}>
                <Button
                    fab
                    mini
                    color="accent"
                    aria-owns={anchorEl ? 'simple-menu' : null}
                    aria-haspopup="true"
                    onClick={this.handleClick}
                >
                    <MoreVertIcon />
                </Button>
                <Menu
                    id="simple-menu"
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={this.handleClose}
                >
                    {items.map((item,i) => {
                            return <MenuItem onClick={()=>{this.handleClose();item.onClick()}} key={i}>{item.name}</MenuItem>
                    })}

                </Menu>
            </div>
        )
    }
}


SimpleMenu.propTypes = {
    items: PropTypes.array.isRequired
}

export default SimpleMenu