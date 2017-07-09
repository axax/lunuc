import React from 'react'
import PropTypes from 'prop-types'
import Util from '../../util'

const ChatMessage = ({message, onClick, onDeleteClick}) => {
	return <div onClick={onClick} style={{padding:20+'px',marginBottom: 20+'px',width: 'auto', backgroundColor: (message._id.indexOf('#')===0?'#90afe5':'#fffcea')}}>
		<strong><small>{message.from.username}</small></strong><br />
		{message.text}<br />
		<small><small>{Util.formattedDatetimeFromObjectId(message._id)}</small></small>
		<button onClick={onDeleteClick}>Delete</button>
	</div>
}

ChatMessage.propTypes = {
	message: PropTypes.object.isRequired,
	onClick: PropTypes.func,
	onDeleteClick: PropTypes.func
}

export default ChatMessage