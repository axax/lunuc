import React from 'react'
import PropTypes from 'prop-types'

/* Component with a state */
export default class AddChatMessage extends React.Component {
	constructor(props) {
		super(props)
		this.state = {message: ''}
	}
	onChangeMessage = (e) => {
		this.setState({message: e.target.value})
	}

	onSendCick = () => {
		this.props.onClick({message: this.state.message})
	}

	render() {
		return (
			<div>
				<textarea onChange={this.onChangeMessage} value={this.state.message}/>
				<button onClick={this.onSendCick}>Send</button>
			</div>
		)
	}
}

AddChatMessage.propTypes = {
	onClick: PropTypes.func
}