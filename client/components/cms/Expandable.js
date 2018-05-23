import React from 'react'
import PropTypes from 'prop-types'
import {Typography, ExpansionPanel} from 'ui/admin'

class Expandable extends React.Component {

    constructor(props){
        super(props)
        this.state = {
            expanded: false
        }
    }


    render(){
        const {title,children, ...rest} = this.props

        return <ExpansionPanel onChange={this.handleExpansion.bind(this)} heading={<Typography variant="headline">{title}</Typography>}>
            {this.state.expanded && <div style={{width:'100%'}}>
                {children}
            </div>
            }
            </ExpansionPanel>
    }

    handleExpansion(e, expanded){
        this.setState({expanded})
    }
}

Expandable.propTypes = {
    title: PropTypes.string
}

export default Expandable

