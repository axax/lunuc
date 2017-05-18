import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as Actions from '../actions/ErrorHandlerAction'


const ErrorHandlerContainer = ({messages}) => {

	let pairs = []

	if (messages) {
		Object.keys(messages).forEach(
			(key) => pairs.push(<div key={key}>{messages[key].msg}</div>)
		)
	}

	if( pairs.length>0 ){
		return <div>
			{pairs}
		</div>
	}

	return null

}


ErrorHandlerContainer.propTypes = {
	messages: PropTypes.object.isRequired
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

