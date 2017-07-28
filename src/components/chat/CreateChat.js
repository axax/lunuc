import React from 'react'
import PropTypes from 'prop-types'

export default class CreateChat extends React.Component {
	constructor(props) {
		super(props)
		this.state = {name: ''}
	}
	onChangeName = (e) => {
		this.setState({name: e.target.value})
	}

	onSendCick = () => {
		this.props.onClick({name: this.state.name})
		this.setState({name:''})
		this.textInput.focus()
	}

	handleKeyPress = (e) => {
		if (e.key === 'Enter'){
			e.preventDefault()
			this.onSendCick()
			return false
		}
	}

	render() {
		return (
			<div>
				<input ref={(e) => { this.textInput = e }} onChange={this.onChangeName} onKeyPress={this.handleKeyPress} value={this.state.name}/>
				<button onClick={this.onSendCick} disabled={(this.state.name.trim()=='')}>Create new chat</button>
			</div>
		)
	}
}

CreateChat.propTypes = {
	onClick: PropTypes.func
}