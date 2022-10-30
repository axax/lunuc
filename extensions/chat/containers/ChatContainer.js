import React from 'react'
import compose from 'util/compose'
import config from 'gen/config-client'
import {client, graphql} from '../../../client/middleware/graphql'
import {getTypeQueries} from '../../../util/types.mjs'
import {Link} from '../../../client/util/route'
import Util from '../../../client/util/index.mjs'
import AddChatUser from '../components/chat/AddChatUser'
import ChatMessage from '../components/chat/ChatMessage'
import AddChatMessage from '../components/chat/AddChatMessage'
import CreateChat from "../components/chat/CreateChat";

const {ADMIN_BASE_URL} = config

class ChatContainer extends React.Component {

    componentDidMount() {
        this.subscribeMessage = this.props.subscribeMessages()
    }


    render() {
        const {chats, messages, users, match} = this.props
        if(!chats){
            return null
        }
        const selectedChatId = match.params.id

        const selectedChat = chats.results.find(e=>e._id===selectedChatId)
        console.log('render ChatContainer')
        return <>
            <ul>
                {chats.results.map((chat, i) => {
                    /*if (chat._id === selectedChatId) {
                        selectedChat = chat
                    }*/
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

                    <strong>users: </strong>
                    {selectedChat.users.map((user, i) => {
                        if(!user){
                            user = {}
                        }
                        const isCreator = user._id === selectedChat.createdBy._id
                        return <span key={i}
                                     style={{fontWeight: (isCreator ? 'bold' : 'normal')}}>{user.username}{isCreator ? '' :
                            <button onClick={this.handleRemoveUserFromChatClick.bind(this, selectedChat, user)}>
                                x</button>}{(i < selectedChat.users.length - 1 ? ', ' : '')}</span>
                    })}
                    {users && <AddChatUser users={users.results} selectedUsers={selectedChat.users}
                                 onClick={this.handleAddChatUserClick}/>}

                    {messages && messages.results.slice(0).reverse().map((message, i) => {
                        return <ChatMessage key={i} message={message}
                                            onDeleteClick={this.handleMessageDeleteClick.bind(this, message)}/>
                    })}

                    <AddChatMessage onClick={this.handleAddChatMessageClick}/>
                </div>
                : ''}
            </>
    }


    handleCreateChatClick = (data) => {
        const {createChat} = this.props

        createChat({
            name: data.name
        })
    }

    handleAddChatMessageClick = (data) => {
        const {createMessage, match} = this.props
        const selectedChatId = match.params.id

        if (selectedChatId) {
            createMessage({
                chat: selectedChatId,
                message: data.message
            })
        }
    }
    handleMessageDeleteClick = (message) => {
        const {deleteChatMessage, match} = this.props
        deleteChatMessage({
            _id: message._id
        })
    }

    handleChatDeleteClick = (chat) => {
        const {deleteChat} = this.props
        deleteChat({
            _id: chat._id
        })
    }


    handleAddChatUserClick = (data) => {
        const {addUserToChat, match} = this.props

        const selectedChatId = match.params.id

        if (selectedChatId) {
            addUserToChat({
                userId: data.selected,
                chatId: selectedChatId
            })
        }
    }


    handleRemoveUserFromChatClick = (chat, user) => {
        const {removeUserFromChat} = this.props
        if (chat && chat._id) {
            removeUserFromChat({
                userId: user._id,
                chatId: chat._id
            })
        }
    }

}


const queriesChat = getTypeQueries('Chat', false, {loadAll: false})
const queriesMessage = getTypeQueries('ChatMessage', false, {loadAll: false})
const gqlAddUserToChat = `mutation addUserToChat($userId: ID!, $chatId: ID!){addUserToChat(userId:$userId,chatId:$chatId){_id status}}`
const gqlRemoveUserFromChat = `mutation removeUserFromChat($userId: ID!, $chatId: ID!){removeUserFromChat(userId:$userId,chatId:$chatId){_id status}}`

export default compose(
    graphql('query users($sort:String,$limit:Int,$page:Int,$filter:String){users(sort:$sort,limit:$limit,page:$page,filter:$filter){limit offset total meta results{_id username role{name}}}}', {
        options() {
            const options = {
                variables:{filter:'role.name==[administrator,author]'},
                fetchPolicy: 'cache-and-network'
            }
            return options
        },
        props: ({data: {users}}) => ({
            users
        })
    }),
    graphql(queriesChat.query, {
        options() {
            const options = {
                fetchPolicy: 'cache-and-network'
            }
            return options
        },
        props: ({data: {chats}}) => ({
            chats
        })
    }),
    graphql(queriesChat.create, {
        props: ({mutate}) => ({
            createChat: ({name}) => {
                return mutate({
                    variables: {name, users:[_app_.user._id]},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        createChat: {
                            _id: '#' + new Date().getTime(),
                            name,
                            status: 'creating',
                            messages: [],
                            createdBy: {
                                _id: _app_.user._id,
                                username: _app_.user.username,
                                __typename: 'UserPublic'
                            },
                            users: [
                                {
                                    _id: _app_.user._id,
                                    username: _app_.user.username,
                                    __typename: 'UserPublic'
                                }
                            ],
                            __typename: 'Chat'
                        }
                    },
                    update: (store, {data: {createChat}}) => {
                        const storeData = store.readQuery({query: queriesChat.query})
                        const newResults = [...storeData.chats.results]
                        newResults.push(createChat)
                        const newChats = {...storeData.chats, results:newResults}
                        store.writeQuery({query: queriesChat.query, data: {...storeData, chats: newChats}})
                    }
                })
            }
        }),
    }),
    graphql(queriesChat.delete, {
        props: ({mutate}) => ({
            deleteChat: ({_id}) => {
                return mutate({
                    variables: {_id},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        deleteChat: {
                            _id,
                            status: 'deleting',
                            __typename: 'Chat'
                        }
                    },
                    update: (store, {data: {deleteChat}}) => {
                        const storeData = store.readQuery({query: queriesChat.query})
                        if(storeData.chats){

                            const chatIdx = storeData.chats.results.findIndex((e) => e._id === deleteChat._id)
                            if (chatIdx >= 0) {
                                const newResults = [...storeData.chats.results]

                                if (deleteChat.status == 'deleting') {
                                    newResults[chatIdx] = {...newResults[chatIdx], status: 'deleting'}
                                } else {
                                    newResults.splice(chatIdx, 1)
                                }
                                const newChats = {...storeData.chat, results:newResults}
                                store.writeQuery({query: queriesChat.query, data: {...storeData, chats: newChats}})
                            }
                        }



                    }
                })
            }
        })
    }),
    graphql(queriesMessage.query, {
        skip(props){
            const {match} = props
            if(!match.params.id){
                return true
            }

            return false
        },
        options(props) {
            const {match} = props
            return {
                variables: {filter:'chat=='+match.params.id, sort:'_id desc'},
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {chatMessages}, ownProps}) => {
            return {
                messages: chatMessages,
                subscribeMessages: ()=>{

                    return client.subscribe({
                        query: `subscription subscribeChatMessage{subscribeChatMessage{action removedIds data{_id message chat{_id name} createdBy{username _id}}}}`
                    }).subscribe({
                        next({data:{subscribeChatMessage}}) {
                            const {data,removedIds, action} = subscribeChatMessage
                            if(action==='delete'){
                                removedIds.forEach(_id=>{
                                    const {match} = ownProps,
                                        variables = {filter:'chat=='+match.params.id, sort:'_id desc'}

                                    const storeData = client.readQuery({
                                        query: queriesMessage.query,
                                        variables
                                    })

                                    const msgIdx = storeData.chatMessages.results.findIndex(f=>f._id==_id)
                                    if(msgIdx>=0) {
                                        const newResults = [...storeData.chatMessages.results]
                                        newResults.splice(msgIdx, 1)
                                        const newChats = Object.assign({}, storeData.chatMessages, {results: newResults})
                                        client.writeQuery({
                                            query: queriesMessage.query,
                                            variables,
                                            data: {...storeData, chatMessages: newChats}
                                        })
                                    }
                                })
                            }else if(action==='create') {
                                const message = data[0]
                                const variables = {
                                    filter: 'chat==' + message.chat._id,
                                    sort: '_id desc'
                                }
                                const storeData = client.readQuery({
                                    query: queriesMessage.query,
                                    variables
                                })


                                const newResults = [...storeData.chatMessages.results]
                                newResults.unshift(message)
                                const newChats = Object.assign({}, storeData.chatMessages, {results: newResults})
                                client.writeQuery({
                                    query: queriesMessage.query,
                                    variables,
                                    data: {...storeData, chatMessages: newChats}
                                })
                            }
                        }
                    })

                }
            }
        }
    }),
    graphql(queriesMessage.create, {
        props: ({mutate, ownProps}) => ({
            createMessage: ({chat, message}) => {
                const oid = '#' + new Date().getTime()
                return mutate({
                    variables: {chat, message},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        createChatMessage: {
                            _id: oid,
                            status: 'creating',
                            createdBy: {
                                __typename: 'UserPublic',
                                _id: _app_.user._id,
                                username: _app_.user.username
                            },
                            chat: {
                                __typename: 'Chat',
                                _id: chat
                            },
                            message,
                            __typename: 'Message'
                        }
                    },

                    update: (store, {data: {createChatMessage}}) => {
                        const {match} = ownProps,
                            variables = {filter:'chat=='+match.params.id, sort:'_id desc'},
                            storeData = store.readQuery({query: queriesMessage.query, variables})
                        if(storeData) {
                            const results = storeData.chatMessages.results
                            const idx = results.findIndex((e) => e._id === oid)
                            const newResults = [...results]
                            if (idx >= 0) {
                                newResults[idx] = createChatMessage
                            }else{
                                newResults.unshift(createChatMessage)
                            }
                            storeData.chatMessages = Object.assign({},storeData.chatMessages,{results:newResults})

                            store.writeQuery({query: queriesMessage.query, variables, data: storeData})
                        }
                    }
                })
            }
        }),
    }),
    graphql(queriesMessage.delete, {
        props: ({ownProps, mutate}) => ({
            deleteChatMessage: ({_id}) => {
                return mutate({
                    variables: {_id},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        deleteChatMessage: {
                            _id: _id,
                            status: 'deleting',
                            __typename: 'Message'
                        }
                    },
                    update: (store, {data: {deleteChatMessage}}) => {
                        const {match} = ownProps,
                            variables = {filter:'chat=='+match.params.id, sort:'_id desc'},
                            storeData = store.readQuery({query: queriesMessage.query, variables})

                        if(storeData) {
                            const results = storeData.chatMessages.results
                            const idx = results.findIndex((e) => e._id === deleteChatMessage._id)

                            if (idx >= 0) {
                                const newResults = [...results]
                                if(deleteChatMessage.status==='deleting') {
                                    newResults[idx] = Object.assign({},newResults[idx], deleteChatMessage)
                                }else {
                                    newResults.splice(idx, 1)
                                }
                                storeData.chatMessages = Object.assign({},storeData.chatMessages,{results:newResults})

                                store.writeQuery({query: queriesMessage.query, variables, data: storeData})
                            }
                        }
                    }
                })
            }
        })
    }),
    graphql(gqlAddUserToChat, {
        props: ({ownProps,mutate}) => ({
            addUserToChat: ({userId, chatId}) => {
                return mutate({
                    variables: {userId, chatId},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        addUserToChat: {
                            _id: chatId,
                            status: 'adding_user',
                            __typename: 'Chat'
                        }
                    },
                    update: (store) => {
                        const storeData = store.readQuery({query: queriesChat.query})
                        if (storeData && storeData.chats && ownProps.users) {

                            const chatIdx = storeData.chats.results.findIndex((e) => e._id === chatId)
                            const userIdx = ownProps.users.results.findIndex((e) => e._id === userId)

                            if (chatIdx >= 0 && userIdx >= 0) {
                                const newResults = [...storeData.chats.results]
                                newResults[chatIdx] = {...newResults[chatIdx], users: [...newResults[chatIdx].users]}

                                newResults[chatIdx].users.push(ownProps.users.results[userIdx])

                                const newChats = Object.assign({},storeData.chats,{results:newResults})
                                store.writeQuery({query: queriesChat.query, data: {...storeData,chats:newChats}})
                            }
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
                        removeUserFromChat: {
                            _id: chatId,
                            status: 'removing_user',
                            __typename: 'Chat'
                        }
                    },
                    update: (store) => {
                        const storeData = store.readQuery({query: queriesChat.query})
                        if (storeData && storeData.chats) {

                            const chatIdx = storeData.chats.results.findIndex((e) => e._id === chatId)

                            if (chatIdx >= 0) {
                                const newResults = [...storeData.chats.results]
                                const newUsers = [...newResults[chatIdx].users]
                                const userIdx = newUsers.findIndex((e) => e._id === userId)

                                if(userIdx>=0){
                                    newUsers.splice(userIdx, 1)
                                    newResults[chatIdx] = {...newResults[chatIdx],users:newUsers}
                                    const newChats = Object.assign({},storeData.chats,{results:newResults})
                                    store.writeQuery({query: queriesChat.query, data: {...storeData,chats:newChats}})
                                }
                            }
                        }
                    }
                })
            }
        }),
    }))(ChatContainer)

