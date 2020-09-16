import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import {Link} from 'react-router-dom'
import ChatMessage from '../components/chat/ChatMessage'
import CreateChat from '../components/chat/CreateChat'
import AddChatUser from '../components/chat/AddChatUser'
import AddChatMessage from '../components/chat/AddChatMessage'
import {connect} from 'react-redux'
import Util from 'client/util'
import BaseLayout from 'client/components/layout/BaseLayout'
import config from 'gen/config'
import {graphql} from '../../../client/middleware/graphql'

const {ADMIN_BASE_URL} = config

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

    handleAddChatUserClick = (data) => {
        const {addUserToChat, match} = this.props

        const selectedChatId = match.params.id

        if (selectedChatId) {
            addUserToChat({
                userId: data.selected,
                chatId: selectedChatId
            }).then(({data}) => {
            })
        }
    }

    handleRemoveUserFromChatClick = (chat, user) => {
        const {removeUserFromChat} = this.props
        if (chat && chat._id) {
            removeUserFromChat({
                userId: user._id,
                chatId: chat._id
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
        const {chatsWithMessages, users, loading, match} = this.props
        const selectedChatId = match && match.params && match.params.id

        if (!chatsWithMessages) {
            if (loading)
                return <div>loading chats</div>
            return null
        }

        console.log('render chat', loading)

        let selectedChat = false

        return (
            <BaseLayout>
                <h1>Chats</h1>
                <ul>
                    {chatsWithMessages.slice(0).reverse().map((chat, i) => {
                        if (chat._id === selectedChatId) {
                            selectedChat = chat
                        }
                        const url = ADMIN_BASE_URL + '/chat/' + chat._id
                        return <li key={i}>{['creating', 'deleting'].indexOf(chat.status) > -1 ? <div>{chat.name}
                        </div> : <div><Link to={url}>{chat.name}</Link>
                            <button onClick={this.handleChatDeleteClick.bind(this, chat)}>x</button>
                        </div>}
                            <small>
                                <small>{Util.formattedDatetimeFromObjectId(chat._id)}</small>
                            </small>
                        </li>
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
                                             style={{fontWeight: (isCreator ? 'bold' : 'normal')}}>{user.username}{isCreator ? '' :
                                    <button onClick={this.handleRemoveUserFromChatClick.bind(this, selectedChat, user)}>
                                        x</button>}{(i < selectedChat.users.length - 1 ? ', ' : '')}</span>
                            })}
                            <AddChatUser users={users} selectedUsers={selectedChat.users}
                                         onClick={this.handleAddChatUserClick}/>
                        </div>

                        <button onClick={this.handleOnLoadMore.bind(this, selectedChat)}>load older</button>
                        {selectedChat.messages.slice(0).reverse().map((message, i) => {
                            return <ChatMessage key={i} message={message}
                                                onDeleteClick={this.handleMessageDeleteClick.bind(this, message)}/>
                        })}
                        <AddChatMessage onClick={this.handleAddChatMessageClick}/>
                    </div>
                    : ''}
            </BaseLayout>
        )
    }
}


ChatContainer.propTypes = {
    /* routing params */
    match: PropTypes.object,
    /* apollo client props */
    loading: PropTypes.bool,
    chatsWithMessages: PropTypes.array,
    users: PropTypes.array,
    createChat: PropTypes.func.isRequired,
    addUserToChat: PropTypes.func.isRequired,
    removeUserFromChat: PropTypes.func.isRequired,
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

const MESSAGES_PER_PAGE = 10
const CHATS_PER_PAGE = 99

const gqlQuery = `query{publicUsers{_id username} chatsWithMessages(limit: ${CHATS_PER_PAGE}, messageLimit: ${MESSAGES_PER_PAGE}){_id status name messages{_id text status from{username _id}}users{username _id}createdBy{username _id}}}`
const gqlQueryMoreMessages = `query chatMessages($chatId: String!, $messageOffset: Int, $messageLimit: Int){
	chatMessages(chatId:$chatId, messageOffset:$messageOffset, messageLimit:$messageLimit){
		_id text status from{username _id}
	}
}`


const gqlCreateChat = `mutation createChat($name: String!){createChat(name:$name){_id status name messages{_id text status from{username _id}}users{username _id}createdBy{username _id}}}`
const gqlAddUserToChat = `mutation addUserToChat($userId: ID!, $chatId: ID!){addUserToChat(userId:$userId,chatId:$chatId){_id status}}`
const gqlRemoveUserFromChat = `mutation removeUserFromChat($userId: ID!, $chatId: ID!){removeUserFromChat(userId:$userId,chatId:$chatId){_id status}}`
const gqlDeleteChat = `mutation deleteChat($chatId: ID!){deleteChat(chatId:$chatId){_id status}}`

const gqlInsertMessage = `mutation createMessage($chatId: ID!, $text: String!) {createMessage(chatId:$chatId,text:$text){_id text status to{_id} from{_id,username}}}`
const gqlDeleteMessage = `mutation deleteMessage($messageId: ID!,$chatId: ID) {deleteMessage(messageId:$messageId,chatId:$chatId){_id status to{_id}}}`

/*Subscriptions*/
const gqlOnCreateMessage = `subscription{messageCreated{_id text status from{_id username}to{_id}}}`
const gqlOnDeleteMessage = `subscription{messageDeleted{_id status to{_id}}}`


const fnCreateMessage = (prev, message) => {

}


const ChatContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: props => {
            const {loading, chatsWithMessages, publicUsers, fetchMore} = props.data
            return {
                chatsWithMessages,
                users: publicUsers,
                loading,
                onCreateMessage: params => {
                    return props.data.subscribeToMore({
                        document: gqlOnCreateMessage,
                        updateQuery: (prev, {subscriptionData}) => {
                            const message = subscriptionData.data.messageCreated
                            const chatIdx = prev.chatsWithMessages.findIndex((e) => e._id === message.to._id)
                            if (chatIdx >= 0) {
                                const msgIdx = prev.chatsWithMessages[chatIdx].messages.findIndex((e) => e._id === message._id)
                                if (msgIdx < 0) {
                                    // deep copy prev
                                    const newPrev = JSON.parse(JSON.stringify(prev))

                                    // prepend message
                                    newPrev.chatsWithMessages[chatIdx].messages.unshift(message)
                                    return newPrev
                                }
                            }
                            return prev
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
                loadMoreMessages({chatId, messageOffset}) {

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
                                    const newPrev = JSON.parse(JSON.stringify(prev))
                                    // prpend message
                                    newPrev.chatsWithMessages[chatIdx].messages.push(fetchMoreResult.chatMessages)

                                    return newPrev
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
                        const storeData = store.readQuery({query: gqlQuery})
                        const newData = [...storeData.chatsWithMessages]
                        newData.push(createChat)
                        store.writeQuery({query: gqlQuery, data: {...storeData, chatsWithMessages: newData}})
                    }
                })
            }
        }),
    }),
    graphql(gqlAddUserToChat, {
        props: ({ownProps, mutate}) => ({
            addUserToChat: ({userId, chatId}) => {
                const user = ownProps.users.find(u => u._id === userId)

                return mutate({
                    variables: {userId, chatId},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        addUserToChat: {
                            _id: chatId,
                            status: 'adding_user',
                            __typename: 'Chat'
                        }
                    },
                    update: (store, {data: {addUserToChat}}) => {
                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({query: gqlQuery})
                        if (storeData.chatsWithMessages) {
                            const newData = [...storeData.chatsWithMessages]

                            const chatIdx = newData.findIndex((e) => e._id === chatId)
                            const userIdx = data.publicUsers.findIndex((e) => e._id === userId)
                            if (chatIdx >= 0 && userIdx >= 0) {
                                newData[chatIdx] = {...newData[chatIdx], users: [...newData[chatIdx].users]}
                                newData[chatIdx].users.unshift(data.publicUsers[userIdx])
                            }


                            store.writeQuery({query: gqlQuery, data: {...storeData, chatsWithMessages: newData}})
                        }
                    }
                })
            }
        }),
    }),
    graphql(gqlRemoveUserFromChat, {
        props: ({ownProps, mutate}) => ({
            removeUserFromChat: ({userId, chatId}) => {
                return mutate({
                    variables: {userId, chatId},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        removeUserFromChat: {
                            _id: chatId,
                            status: 'removing_user',
                            __typename: 'Chat'
                        }
                    },
                    update: (store, {data: {removeUserFromChat}}) => {
                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({query: gqlQuery})

                        const chatIdx = storeData.chatsWithMessages.findIndex((e) => e._id === chatId)
                        if (chatIdx >= 0) {
                            const newData = [...storeData.chatsWithMessages]
                            newData[chatIdx] = {...newData[chatIdx], users: [...newData[chatIdx].users]}

                            newData[chatIdx].users = data.chatsWithMessages[chatIdx].users.filter(u => u._id !== userId)

                            store.writeQuery({query: gqlQuery, data: {...storeData, chatsWithMessages: newData}})

                        }

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
                        const storeData = store.readQuery({query: gqlQuery})

                        const chatIdx = storeData.chatsWithMessages.findIndex((e) => e._id === deleteChat._id)
                        if (chatIdx >= 0) {
                            const newData = [...storeData.chatsWithMessages]

                            if (deleteChat.status == 'deleting') {
                                console.log(data.chatsWithMessages[chatIdx])
                                newData[chatIdx] = {...newData[chatIdx], status: 'deleting'}
                            } else {
                                newData.splice(chatIdx, 1)
                            }
                            store.writeQuery({query: gqlQuery, data: {...storeData, chatsWithMessages: newData}})
                        }

                    }
                })
            }
        })
    }),
    graphql(gqlInsertMessage, {
        props: ({ownProps, mutate}) => ({
            createMessage: ({chatId, text}) => {
                const oid = '#' + new Date().getTime()
                return mutate({
                    variables: {chatId, text},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        createMessage: {
                            _id: oid,
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
                    },

                    update: (store, {data: {createMessage}}) => {
                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({query: gqlQuery})

                        const chatIdx = storeData.chatsWithMessages.findIndex((e) => e._id === createMessage.to._id)
                        if (chatIdx >= 0) {
                            const newData = [...storeData.chatsWithMessages]
                            newData[chatIdx] = {...newData[chatIdx], messages: [...newData[chatIdx].messages]}

                            // remove optimistic id
                            const msgOIdx = storeData.chatsWithMessages[chatIdx].messages.findIndex((e) => e._id === oid)
                            if (msgOIdx > -1) {
                                newData[chatIdx].messages.splice(msgOIdx, 1)
                            }
                            const msgIdx = storeData.chatsWithMessages[chatIdx].messages.findIndex((e) => e._id === createMessage._id)
                            if (msgIdx < 0) {
                                newData[chatIdx].messages.unshift(createMessage)
                            }
                            store.writeQuery({query: gqlQuery, data: {...storeData, chatsWithMessages: newData}})
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

