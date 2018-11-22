import React from 'react'
import PropTypes from 'prop-types'
import {Typography, ExpansionPanel} from 'ui/admin'

class Expandable extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            expanded: props.expanded
        }
    }


    render() {
        const {title, children} = this.props

        return <ExpansionPanel expanded={this.state.expanded} onChange={this.handleExpansion.bind(this)}
                               heading={<Typography variant="h5">{title}</Typography>}>
            {this.state.expanded ? <div style={{width: '100%'}}>
                {children}
            </div>: <div /> }
        </ExpansionPanel>
    }

    handleExpansion(e, expanded) {
        const {onChange} = this.props
        this.setState({expanded})
        if (onChange) {
            onChange(expanded)
        }
    }
}

Expandable.propTypes = {
    title: PropTypes.string,
    onChange: PropTypes.func,
    expanded: PropTypes.bool
}

export default Expandable

