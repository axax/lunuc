import React from 'react'
import PropTypes from 'prop-types'
import {_t} from '../../../../util/i18n.mjs'

/* Component with a state */
export default class AddChatUser extends React.Component {
	constructor(props) {
		super(props)
		this.state = {selected: ''}
	}
	onChange = (e) => {
		this.setState({selected: e.target.value})
	}

	onSendCick = () => {
		this.props.onClick({selected: this.state.selected})
	}

	render() {
		const {users,selectedUsers} = this.props
		const selectedUserIds = selectedUsers.map(function(u) {return u && u._id})
		const filteredUsers = users.filter((u)=>selectedUserIds.indexOf(u._id)<0)

		return (
			<div  className="chat-add-user-wrapper">
				<select value={this.state.selected} onChange={this.onChange}>
					<option value="">{_t('ChatContainer.selectUser')}</option>
					{filteredUsers.map((user, i) => {
						return <option key={i} value={user._id}>{user.username}</option>
					})}
				</select>
				<button onClick={this.onSendCick} disabled={(this.state.selected.trim()=='')}>+</button>
			</div>
		)
	}
}

AddChatUser.propTypes = {
	onClick: PropTypes.func.isRequired,
	users: PropTypes.array.isRequired,
	selectedUsers: PropTypes.array.isRequired,
}