import React from 'react'
import PropTypes from 'prop-types'
import {gql, graphql, compose} from 'react-apollo'
import {Link} from 'react-router-dom'
import ChatMessage from '../components/chat/ChatMessage'
import CreateChat from '../components/chat/CreateChat'
import AddChatMessage from '../components/chat/AddChatMessage'
import update from 'immutability-helper'
import {connect} from 'react-redux'
import Util from '../util'


class ChatContainer extends React.Component {

	componentWillMount() {
		this.props.onCreateMessage()
		this.props.onDeleteMessage()
	}

	handleMessageDeleteClick = (message) => {
		const {deleteMessage, match} = this.props
		const selectedChatId = match.params.id

		deleteMessage({
			messageId: message._id,
			chatId: selectedChatId
		}).then(({data}) => {
		})
	}

	handleChatDeleteClick = (chat) => {
		const {deleteChat} = this.props

		deleteChat({
			chatId: chat._id
		}).then(({data}) => {
		})
	}

	handleAddChatMessageClick = (data) => {
		const {createMessage, match} = this.props
		const selectedChatId = match.params.id

		if (selectedChatId) {
			createMessage({
				chatId: selectedChatId,
				text: data.message
			}).then(({data}) => {
			})
		}
	}

	handleCreateChatClick = (data) => {
		const {createChat, match} = this.props

		createChat({
			name: data.name
		}).then(({data}) => {
		})
	}

	handleOnLoadMore = (selectedChat) => {
		const {loadMoreMessages} = this.props

		if (selectedChat) {
			loadMoreMessages({
				chatId: selectedChat._id,
				messageOffset: selectedChat.messages.length
			}).then(({data}) => {
			})
		}
	}

	render() {
		const {chatsWithMessages, loading, match} = this.props
		const selectedChatId = match.params.id

		if (!chatsWithMessages)
			return null

		console.log('render chat', loading)

		let selectedChat = false

		return (
			<div>
				<h1>Chats</h1>
				<ul>
					{chatsWithMessages.slice(0).reverse().map((chat, i) => {
						if (chat._id === selectedChatId) {
							selectedChat = chat
						}
						const url = '/chat/' + chat._id
						return <li key={i}>{['creating','deleting'].indexOf(chat.status)>-1 ? <div>{chat.name}
						</div>:<div><Link to={url}>{chat.name}</Link> <button onClick={this.handleChatDeleteClick.bind(this, chat)}>x</button></div>}
							<small><small>{Util.formattedDatetimeFromObjectId(chat._id)}</small></small></li>
					})}
				</ul>

				<CreateChat onClick={this.handleCreateChatClick}/>

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

						<button onClick={this.handleOnLoadMore.bind(this, selectedChat)}>load older</button>
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
	/* routing params */
	match: PropTypes.object,
	/* apollo client props */
	loading: PropTypes.bool,
	chatsWithMessages: PropTypes.array,
	createChat: PropTypes.func.isRequired,
	deleteChat: PropTypes.func.isRequired,
	createMessage: PropTypes.func.isRequired,
	deleteMessage: PropTypes.func.isRequired,
	user: PropTypes.object.isRequired,
	/*Subscribtion*/
	onCreateMessage: PropTypes.func.isRequired,
	onDeleteMessage: PropTypes.func.isRequired,
	/*load more*/
	loadMoreMessages: PropTypes.func.isRequired
}

const MESSAGES_PER_PAGE = 2

const gqlQuery = gql`query{chatsWithMessages(messageLimit: ${MESSAGES_PER_PAGE}){_id status name messages{_id text status from{username _id}}users{username _id}createdBy{username _id}}}`
const gqlQueryMoreMessages = gql`query chatMessages($chatId: String!, $messageOffset: Int, $messageLimit: Int){
	chatMessages(chatId:$chatId, messageOffset:$messageOffset, messageLimit:$messageLimit){
		_id text status from{username _id}
	}
}`

const gqlCreateChat = gql`mutation createChat($name: String!){createChat(name:$name){_id status name messages{_id text status from{username _id}}users{username _id}createdBy{username _id}}}`
const gqlDeleteChat = gql`mutation deleteChat($chatId: ID!){deleteChat(chatId:$chatId){_id status}}`

const gqlInsertMessage = gql`mutation createMessage($chatId: ID!, $text: String!) {createMessage(chatId:$chatId,text:$text){_id text status to{_id} from{_id,username}}}`
const gqlDeleteMessage = gql`mutation deleteMessage($messageId: ID!,$chatId: ID) {deleteMessage(messageId:$messageId,chatId:$chatId){_id status to{_id}}}`

/*Subscriptions*/
const gqlOnCreateMessage = gql`subscription{createMessage{_id text status from{_id username}to{_id}}}`
const gqlOnDeleteMessage = gql`subscription{deleteMessage{_id status to{_id}}}`


const createMessage = (prev, message) => {
	const chatIdx = prev.chatsWithMessages.findIndex((e) => e._id === message.to._id)
	if (chatIdx >= 0) {
		const msgIdx = prev.chatsWithMessages[chatIdx].messages.findIndex((e) => e._id === message._id)
		if (msgIdx < 0) {
			return update(prev, {chatsWithMessages: {[chatIdx]: {messages: {$splice: [[0, 0, message]]}}}})
		}
	}
	return prev
}


const ChatContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				reducer: (prev, {operationName, type, result: {data}}) => {
					if (type === 'APOLLO_MUTATION_RESULT') {
						if (operationName === 'createMessage' && data && data.createMessage && data.createMessage._id) {
							return createMessage(prev, data.createMessage)
						}
					}
					return prev
				}
			}
		},
		props: props => {
			const {loading, chatsWithMessages, fetchMore} = props.data
			return {
				chatsWithMessages,
				loading,
				onCreateMessage: params => {
					return props.data.subscribeToMore({
						document: gqlOnCreateMessage,
						updateQuery: (prev, {subscriptionData}) => {
							return createMessage(prev, subscriptionData.data.createMessage)
						}
					})
				},
				onDeleteMessage: params => {
					return props.data.subscribeToMore({
						document: gqlOnDeleteMessage,
						updateQuery: (prev, {subscriptionData}) => {
							return prev
						}
					})
				},
				loadMoreMessages({chatId, messageOffset})
				{

					return fetchMore({
						query: gqlQueryMoreMessages,
						variables: {
							chatId,
							messageOffset,
							messageLimit: MESSAGES_PER_PAGE
						},
						updateQuery: (previousResult, {fetchMoreResult}) => {
							if (fetchMoreResult) {
								const chatIdx = previousResult.chatsWithMessages.findIndex((e) => e._id === chatId)
								if (chatIdx >= 0) {
									return update(previousResult, {chatsWithMessages: {[chatIdx]: {messages: {$push: fetchMoreResult.chatMessages}}}})
								}
							}
							return previousResult

						}
					})
				}
			}
		}
	}),
	graphql(gqlCreateChat, {
		props: ({ownProps, mutate}) => ({
			createChat: ({name}) => {
				return mutate({
					variables: {name},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
						createChat: {
							_id: '#' + new Date().getTime(),
							name,
							status: 'creating',
							messages: [],
							createdBy: {
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username,
								__typename: 'UserPublic'
							},
							users: [
								{
									_id: ownProps.user.userData._id,
									username: ownProps.user.userData.username,
									__typename: 'UserPublic'
								}
							],
							__typename: 'Chat'
						}
					},
					update: (store, {data: {createChat}}) => {
						console.log('createChat', createChat)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})

						data.chatsWithMessages.push(createChat)
						store.writeQuery({query: gqlQuery, data})
					}
				})
			}
		}),
	}),
	graphql(gqlDeleteChat, {
		props: ({ownProps, mutate}) => ({
			deleteChat: ({chatId}) => {
				return mutate({
					variables: {chatId},
					optimisticResponse: {
						__typename: 'Mutation',
						deleteChat: {
							_id: chatId,
							status: 'deleting',
							__typename: 'Chat'
						}
					},
					update: (store, {data: {deleteChat}}) => {
						console.log('deleteChat', deleteChat)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})

						const chatIdx = data.chatsWithMessages.findIndex((e) => e._id === deleteChat._id)
						if (chatIdx >= 0) {
							if( deleteChat.status == 'deleting' ){
								console.log(data.chatsWithMessages[chatIdx])
								data.chatsWithMessages[chatIdx].status = 'deleting'
							}else {
								data.chatsWithMessages.splice(chatIdx, 1)
							}
							store.writeQuery({query: gqlQuery, data})
						}

					}
				})
			}
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

