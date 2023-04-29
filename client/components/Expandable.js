import React from 'react'
import PropTypes from 'prop-types'
import {Typography, ExpansionPanel} from 'ui/admin'
import Grid from '@mui/material/Grid'
import {getIconByKey} from './ui/impl/material/icon'

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
        const {title, children, disableGutters, icon} = this.props

        let Icon
        if(icon) {
            Icon = getIconByKey(icon)
        }
        return <ExpansionPanel disableGutters={disableGutters} expanded={this.state.expanded} onChange={this.handleExpansion.bind(this)}
                               heading={<Grid
                                   container
                                   direction="row"
                                   justifyContent="flex-start"
                                   alignItems="center">{Icon ? <Icon color="action"  fontSize="medium" sx={{mr:2}}/>: null}<Typography variant="h6">{title}</Typography></Grid>}>
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

