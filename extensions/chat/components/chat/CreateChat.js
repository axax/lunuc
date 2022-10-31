import React from 'react'
import PropTypes from 'prop-types'
import {_t} from "../../../../util/i18n.mjs";

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
			<div className="chat-create-group-wrapper">

				<input ref={(e) => { this.textInput = e }}
					   placeholder={_t('ChatContainer.chatName')}
					   onChange={this.onChangeName}
					   onKeyPress={this.handleKeyPress}
					   value={this.state.name}/>
				<button onClick={this.onSendCick} disabled={(this.state.name.trim()=='')}>{_t('ChatContainer.createChat')}</button>
			</div>
		)
	}
}

CreateChat.propTypes = {
	onClick: PropTypes.func
}