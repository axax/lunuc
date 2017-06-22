import React from 'react'
import PropTypes from 'prop-types'

const ChatLink = ({chat, onClick}) => {
	return <a onClick={onClick}>{chat.name}</a>
}

ChatLink.propTypes = {
	chat: PropTypes.object.isRequired,
	onClick: PropTypes.func
}

export default ChatLink