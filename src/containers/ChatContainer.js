import React from 'react'
import PropTypes from 'prop-types'
import {gql, graphql, compose} from 'react-apollo'
import ChatLink from '../components/chat/ChatLink'
import ChatMessage from '../components/chat/ChatMessage'


class ChatContainer extends React.Component {
	state = {
		selectedChat: false
	}

	shouldComponentUpdate(nextProps){
		// It is not nessecary to render component again
		if( nextProps.loading===true)
			return false
		return true
	}


	handleChatClick = (chat) => {
		this.setState({selectedChat:chat})
	}

	render() {
		const {chatsWithMessages,loading} = this.props
		const {selectedChat} = this.state

		if( !chatsWithMessages )
			return null
		return (
			<div>
				<h1>Chats</h1>
				<ul>
					{chatsWithMessages.map((chat, i)=>{
						return <ChatLink onClick={this.handleChatClick.bind(this,chat)} chat={chat} key={i} />
					})}
				</ul>

				{selectedChat?
					<div>
						<h2>{selectedChat.name}</h2>
						{selectedChat.messages.map((message, i)=>{
							return <ChatMessage key={i} message={message} />
						})}
					</div>
					:''}
			</div>
		)
	}
}


ChatContainer.propTypes = {
	/* apollo client props */
	chatsWithMessages: PropTypes.array,
	loading: PropTypes.bool,
}


const gqlQuery = gql`query{chatsWithMessages{_id name messages{_id text from{username _id}}users{username _id}createdBy{username _id}}}`

const ChatContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
			}
		},
		props: ({data: {loading, chatsWithMessages }}) => ({
			chatsWithMessages,
			loading
		})
	})
)(ChatContainer)


/**
 * Connect the component to
 * the Redux store.
 */
export default ChatContainerWithGql