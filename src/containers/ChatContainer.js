import React from 'react'
import PropTypes from 'prop-types'
import {gql, graphql, compose} from 'react-apollo'
import ChatLink from '../components/chat/ChatLink'
import ChatMessage from '../components/chat/ChatMessage'
import AddChatMessage from '../components/chat/AddChatMessage'
import update from 'immutability-helper'
import {connect} from 'react-redux'


class ChatContainer extends React.Component {
	state = {
		selectedChatId: false
	}

	shouldComponentUpdate(nextProps) {
		// It is not nessecary to render component again
		/*if( nextProps.loading===true)
		 return false*/
		return true
	}


	handleChatClick = (chat) => {
		this.setState({selectedChatId: chat._id})
	}

	handleMessageDeleteClick = (message) => {
		const {selectedChatId} = this.state
		const {deleteMessage} = this.props

		deleteMessage({
			messageId: message._id,
			chatId: selectedChatId
		}).then(({data}) => {
		})


	}

	handleAddChatMessageClick = (data) => {
		const {selectedChatId} = this.state
		const {createMessage} = this.props

		if (selectedChatId) {
			createMessage({
				chatId: selectedChatId,
				text: data.message
			}).then(({data}) => {
			})
		}
	}

	render() {
		const {chatsWithMessages, loading} = this.props
		const {selectedChatId} = this.state
		if (!chatsWithMessages)
			return null

		console.log('render chat', loading)

		let selectedChat = false

		return (
			<div>
				<h1>Chats</h1>
				<ul>
					{chatsWithMessages.map((chat, i) => {
						if (chat._id === selectedChatId) {
							selectedChat = chat
						}
						return <ChatLink onClick={this.handleChatClick.bind(this, chat)} chat={chat} key={i}/>
					})}
				</ul>

				{selectedChat ?
					<div>
						<h2>{selectedChat.name}</h2>

						<div>
							<strong>users: </strong>
							{selectedChat.users.map((user, i) => {
								const isCreator = user._id === selectedChat.createdBy._id
								return <span key={i}
														 style={{fontWeight: (isCreator ? 'bold' : 'normal')}}>{user.username}{(i < selectedChat.users.length - 1 ? ', ' : '')}</span>
							})}
						</div>

						{selectedChat.messages.slice(0).reverse().map((message, i) => {
							return <ChatMessage key={i} message={message}
																	onDeleteClick={this.handleMessageDeleteClick.bind(this, message)}/>
						})}
						<AddChatMessage onClick={this.handleAddChatMessageClick}/>
					</div>
					: ''}
			</div>
		)
	}
}


ChatContainer.propTypes = {
	/* apollo client props */
	chatsWithMessages: PropTypes.array,
	loading: PropTypes.bool,
	createMessage: PropTypes.func.isRequired,
	deleteMessage: PropTypes.func.isRequired,
	user: PropTypes.object.isRequired
}


const gqlQuery = gql`query{chatsWithMessages{_id name messages{_id text status from{username _id}}users{username _id}createdBy{username _id}}}`

const gqlInsertMessage = gql`mutation createMessage($chatId: ID!, $text: String!) {
		createMessage(chatId:$chatId,text:$text){_id text status to{_id} from{_id,username}}
	}`

const gqlDeleteMessage = gql`mutation deleteMessage($messageId: ID!,$chatId: ID) {
		deleteMessage(messageId:$messageId,chatId:$chatId){_id status to{_id}}
	}`

const ChatContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				reducer: (prev, {operationName, type, result: {data}}) => {
					if (type === 'APOLLO_MUTATION_RESULT') {

						if (operationName === 'createMessage' && data && data.createMessage && data.createMessage._id) {

							const idx = prev.chatsWithMessages.findIndex((e) => e._id === data.createMessage.to._id)
							if (idx >= 0) {
								//console.log(prev,update(prev, {chatsWithMessages:{[idx]:{messages: {$splice: [[0,0,data.createMessage]] }}}}) )
								return update(prev, {chatsWithMessages: {[idx]: {messages: {$splice: [[0, 0, data.createMessage]]}}}})
							}
						}
					}
					return prev
				}
			}
		},
		props: ({data: {loading, chatsWithMessages}}) => ({
			chatsWithMessages,
			loading
		})
	}),
	graphql(gqlInsertMessage, {
		props: ({ownProps, mutate}) => ({
			createMessage: ({chatId, text}) => {
				return mutate({
					variables: {chatId, text},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
						createMessage: {
							_id: '#' + new Date().getTime(),
							status: 'creating',
							from: {
								__typename: 'UserPublic',
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username
							},
							to: {
								__typename: 'Chat',
								_id: chatId
							},
							text,
							__typename: 'Message'
						}
					}
				})
			}
		}),
	}),
	graphql(gqlDeleteMessage, {
		props: ({ownProps, mutate}) => ({
			deleteMessage: ({messageId, chatId}) => {
				return mutate({
					variables: {messageId, chatId},
					optimisticResponse: {
						__typename: 'Mutation',
						deleteMessage: {
							_id: messageId,
							to: {
								__typename: 'Chat',
								_id: chatId
							},
							status: 'deleting',
							__typename: 'Message'
						}
					},
					update: (store, {data: {deleteMessage}}) => {
						// Read the data from the cache for this query.
						/*const data = store.readQuery({query: gqlQuery})

						// Add our Message from the mutation to the end.
						const idx = data.chatsWithMessages.findIndex((e) => e._id === deleteMessage.to._id)
						if (idx >= 0) {
							const msgIdx = data.chatsWithMessages[idx].messages.findIndex((e) => e._id === deleteMessage._id)
							// Write the data back to the cache.
							store.writeQuery({query: gqlQuery, data})
						}*/
					}
				})
			}
		})
	})
)(ChatContainer)


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
	const {user} = store
	return {
		user
	}
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
	mapStateToProps
)(ChatContainerWithGql)

