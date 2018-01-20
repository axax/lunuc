import React from 'react'
import PropTypes from 'prop-types'
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

                <button onClick={this.handleClick}>
                    ...
                </button>
                <div onClose={this.handleClose}>
                    {items.map((item,i) => {
                            return <div onClick={()=>{this.handleClose();item.onClick()}} key={i}>{item.name}</div>
                    })}
                </div>
            </div>
        )
    }
}


SimpleMenu.propTypes = {
    items: PropTypes.array.isRequired
}

export default SimpleMenu