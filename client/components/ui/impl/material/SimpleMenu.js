import React from 'react'
import PropTypes from 'prop-types'
import Button from '@material-ui/core/Button'
import Menu from '@material-ui/core/Menu'
import MenuItem from '@material-ui/core/MenuItem'
import MoreVertIcon from '@material-ui/icons/MoreVert'
import IconButton from '@material-ui/core/IconButton'

class SimpleMenu extends React.Component {
    state = {
        anchorEl: null,
    };

    handleClick = event => {
        this.setState({anchorEl: event.currentTarget})
    };

    handleClose = () => {
        this.setState({anchorEl: null})
    };

    render() {
        const {anchorEl} = this.state
        const {style, items, label, mini, color, fab} = this.props
        return (
            <div style={style}>
                {
                    label !== undefined || fab !== undefined ?
                        <Button
                            aria-label="Simple menu"
                            variant={fab?'fab':'flat'}
                            mini={mini}
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
                        return <MenuItem onClick={() => {
                            this.handleClose();
                            item.onClick()
                        }} key={i}>{item.name}</MenuItem>
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