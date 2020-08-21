import React from 'react'
import PropTypes from 'prop-types'
import {Typography, ExpansionPanel} from 'ui/admin'

class Expandable extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            expanded: !!props.expanded
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (!prevState || nextProps.expanded !== prevState.expandedOri) {
            return {
                expanded: !!nextProps.expanded,
                expandedOri: !!nextProps.expanded
            }
        }
        return null
    }


    render() {
        const {title, children} = this.props

        return <ExpansionPanel expanded={this.state.expanded} onChange={this.handleExpansion.bind(this)}
                               heading={<Typography variant="h5">{title}</Typography>}>
            {this.state.expanded ? <div style={{width: '100%'}}>
                {children}
            </div> : null}
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
    children: PropTypes.any,
    title: PropTypes.string,
    onChange: PropTypes.func,
    expanded: PropTypes.bool
}

export default Expandable

