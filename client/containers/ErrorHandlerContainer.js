import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as Actions from 'client/actions/ErrorHandlerAction'
import {SimpleDialog} from 'ui/admin'




class ErrorHandlerContainer extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
        	openDialog:0
        }
    }

    handleDialogClose(key){
        this.props.actions.clearError(key)

    	this.setState({openDialog: this.state.openDialog+1})
	}

    componentWillReceiveProps(nextProps){
        this.setState({openDialog: 0})
    }

    render(){
    	const {messages} = this.props
        if( !messages || !Object.keys(messages).length )
            return null

        const dialogs = []


        Object.keys(messages).forEach(
            (key,i) => dialogs.push(<SimpleDialog key={key} open={this.state.openDialog===i} onClose={this.handleDialogClose.bind(this,key)}
                                          actions={[{key: 'ok', label: 'Ok', type:'primary'}]} title="Error">
                {messages[key].msg}
            </SimpleDialog>)
        )

        return <div>
            {dialogs}
        </div>

    }
}


ErrorHandlerContainer.propTypes = {
	messages: PropTypes.object.isRequired,
    actions: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = (state) => {
	const {errorHandler} = state
	return {
		messages: errorHandler.messages
	}
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
	actions: bindActionCreators(Actions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
	mapStateToProps,
	mapDispatchToProps
)(ErrorHandlerContainer)

