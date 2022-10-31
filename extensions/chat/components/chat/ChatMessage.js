import React from 'react'
import PropTypes from 'prop-types'
import Util from 'client/util/index.mjs'

const ChatMessage = ({message, onDeleteClick}) => {



	const statusBackgroundColor = (status) => {
		if(status==='creating'){
			return '#90afe5'
		}else if(status==='deleting'){
			return '#ff0000'
		}
		return '#fff' // '#fffcea'
	}

	if ( !message || message.status=='deleted'){
		return null
	}
	const isMe = _app_.user._id === message.createdBy._id

	return <div className="chat-channel-message" style={{backgroundColor: statusBackgroundColor(message.status) }}>
		<img className="chat-channel-message-image" src={message.createdBy.picture?'/uploads/'+message.createdBy.picture+'?format=jpeg&width=96&height=96':'/placeholder.svg'} />

		<div className="chat-channel-message-content">
			<div className="chat-channel-message-head">
				<span className="chat-channel-message-user">{message.createdBy.username}</span> <span className="chat-channel-message-time">{Util.formattedDatetimeFromObjectId(message._id)}</span>

				{false && isMe && message.status!=='deleting' && message.status!=='creating'?
				<button onClick={onDeleteClick}>Delete</button>:''}
			</div>

			{message.message}<br />


		</div>
	</div>
}

ChatMessage.propTypes = {
	message: PropTypes.object.isRequired,
	onClick: PropTypes.func,
	onDeleteClick: PropTypes.func
}

export default ChatMessage
