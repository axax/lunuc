import React from 'react'
import PropTypes from 'prop-types'
import Util from 'client/util'

const ChatMessage = ({message, onClick, onDeleteClick}) => {

	const statusBackgroundColor = (status) => {
		if(status==='creating'){
			return '#90afe5'
		}else if(status==='deleting'){
			return '#ff0000'
		}
		return '#fffcea'
	}

	if ( message.status=='deleted'){
		return null
	}

	return <div onClick={onClick} style={{padding:20+'px',marginBottom: 20+'px',width: 'auto', backgroundColor: statusBackgroundColor(message.status) }}>
		<strong><small>{message.from.username}</small></strong><br />
		{message.text}<br />
		<small><small>{Util.formattedDatetimeFromObjectId(message._id)}</small></small>
		{message.status!=='deleting' && message.status!=='creating'?
		<button onClick={onDeleteClick}>Delete</button>:''}
	</div>
}

ChatMessage.propTypes = {
	message: PropTypes.object.isRequired,
	onClick: PropTypes.func,
	onDeleteClick: PropTypes.func
}

export default ChatMessage