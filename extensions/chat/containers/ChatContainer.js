import React from 'react'
import compose from 'util/compose'
import {client, graphql} from '../../../client/middleware/graphql'
import {getTypeQueries} from '../../../util/types.mjs'
import {Link} from '../../../client/util/route'
import Util from '../../../client/util/index.mjs'
import AddChatUser from '../components/chat/AddChatUser'
import ChatMessage from '../components/chat/ChatMessage'
import AddChatMessage from '../components/chat/AddChatMessage'
import CreateChat from '../components/chat/CreateChat'
import DomUtil from '../../../client/util/dom.mjs'
import {registerTrs,_t} from '../../../util/i18n.mjs'
import {translations} from '..//translations/admin'
import {CHAT_BASE_URL} from "../constants";

registerTrs(translations, 'ChatContainer')

class ChatContainer extends React.Component {

    componentDidMount() {
        this.subscribeMessage = this.props.subscribeMessages()

        DomUtil.createAndAddTag('style', 'head', {
            textContent: `
                html,body,#app{
                    height:100%;
                }
                .chat-container{
                    display:flex;
                    height:100%;
                }
                .chat-container-left{
                    background-color:#3e0f40;
                    padding:1rem;
                    color:#fff;
                    
                    display:flex;
                    flex-direction: column;
                }
                .chat-channel-list{
                    list-style: none;
                    padding:0;
                    margin:0 -1rem 1rem -1rem;    
                    flex:1;                
                }
                .chat-channel-list-item{
                    padding:0.3rem 1rem;
                }
                .chat-channel-list-item:hover{
                    background-color:#3e313c;
                }
                
                .chat-channel-list-item.active{
                    background-color:#1164A3;
                }
                
                .chat-channel-list-delete-button{
                    display:none;
                }
                
                .chat-channel-list-link{
                    display:flex;
                    align-items: center;
                    color: #c6b9c6;
                    text-decoration:none;
                    font-size:1.1rem;
                }
                
                .chat-channel-list-image{
                    margin-right:0.5rem;
                    height:1.5rem;
                    width: 1.5rem;
                    border-radius:0.3rem;
                }
                .chat-h3{
                    font-size:1.2rem;
                    font-weight:bold;
                    margin-bottom: 1rem;
                }
                
                .chat-container-right{
                    background-color:rgba(234,234,234,0.1);
                    flex:1;
                    display:flex;                    
                    flex-direction: column;
                }
                .chat-channel-head{
                    display:flex;
                    align-items:center;
                    padding:1rem;  
                    z-index:2;
                    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);                  
                }
                .chat-channel-head .chat-h3{
                    margin-bottom:0;
                }
                .chat-channel-users{
                    margin:0 0.5rem;
                    padding:0;
                    flex:1;
                    display:flex;
                    flex-wrap: wrap;
                }
                .chat-channel-user{
                    display:flex;
                    align-items:center;
                    margin-right: 1rem;
                }
                .chat-channel-user-image{
                    width:1rem;
                    height:1rem;
                    margin-right:0.2rem;
                }
                .chat-channel-body{
                    flex:1;
                    overflow:auto;
                }
                .chat-channel-foot{
                    padding:1rem;                    
                }
                
                .chat-channel-message{
                    padding: 1rem;
                    display:flex;
                }
                .chat-channel-message-content{
                    width: 100%;
                }
                .chat-channel-message-head{
                    display:flex;
                }
                .chat-channel-message-user{
                    font-size:1rem;
                    font-weight:bold;
                    line-height:1;
                }
                .chat-channel-message-time{
                    margin-left:0.2rem;
                    font-size:0.7rem;
                    color:rgb(97,96,97);
                    font-weight:normal;
                }
                .chat-channel-message-readby{
                    margin-left:auto;
                    font-size:0.7rem;
                    color:rgb(97,96,97);
                    font-weight:normal;
                }
                .chat-channel-message-image{                    
                    margin-right:0.5rem;
                    height:2.5rem;
                    width: 2.5rem;
                    border-radius:0.3rem;
                }
                
                
                
                .chat-create-group-wrapper{
                    display:flex;
                    flex-direction: column;
                }
                
                .chat-add-user-wrapper {
                    display: flex;
                }
                .chat-create-group-wrapper > input{
                    border-top-right-radius:0.2rem;
                    border-top-left-radius:0.2rem;
                    border:none;
                    padding:0.5rem;
                    outline:none;
                }
                
                .chat-add-user-wrapper > select{
                    border-color:rgb(200,200,200);
                    border-top-left-radius:0.2rem;
                    border-bottom-left-radius:0.2rem;
                    padding:0.38rem;
                    outline:none;
                    height: 2rem;
                }
                
                .chat-add-user-wrapper > button,
                .chat-create-group-wrapper > button{
                    padding:0.5rem;
                    border:none;
                    background: rgba(0, 122, 90,1);
                    box-shadow: none;
                    color: #fff;
                    font-weight: 700;
                    transition: all 80ms linear;
                }                
                .chat-add-user-wrapper > button{
                    border-bottom-right-radius:0.2rem;
                    border-top-right-radius:0.2rem;
                    height: 2rem;
                    font-size:1.2rem;
                    line-height:1;
                }
                .chat-create-group-wrapper > button{
                    border-bottom-right-radius:0.2rem;
                    border-bottom-left-radius:0.2rem;
                }
                
                
                .chat-add-user-wrapper > button:disabled,
                .chat-create-group-wrapper > button:disabled{
                    color:rgba(255,255,255,0.5);
                    background:  rgba(0, 122, 90,0.4);
                }
                
                .chat-create-message-wrapper{
                    box-shadow: 0 1px 3px #00000014;
                    border: solid 1px rgb(28,28,28,0.3);
                    border-radius: 0.4rem;
                }
                .chat-create-message-wrapper > textarea {
                    border:none;
                    height: 4rem;
                    width:100%;
                    padding:0.5rem;
                    background-color:transparent;
                    outline:none;
                    resize: none;
                }
                
                .chat-create-message-wrapper > button {
                    position:absolute;
                    right: 1.5rem;
                    bottom: 1.2rem;
                    cursor:pointer;
                    background: url('/icons/send.svg') no-repeat center center;
                    border:none;
                    height: 1.5rem;
                    width: 1.5rem;
                    filter: invert(42%) sepia(0%) saturate(0%) hue-rotate(185deg) brightness(97%) contrast(86%);
                }
                
                .chat-create-message-wrapper > button:disabled {
                    cursor:default;
                    filter: invert(85%) sepia(0%) saturate(1%) hue-rotate(45deg) brightness(103%) contrast(95%);
                }
            `,
            id:'chatExtensionCss'
        })
    }

    componentWillUnmount() {
        DomUtil.removeElements('#chatExtensionCss', null, document.head)
        this.subscribeMessage.unsubscribe()
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const chatChannelBody = document.getElementById('chatChannelBody')
        if(chatChannelBody) {
            chatChannelBody.scrollTop = chatChannelBody.scrollHeight
        }
    }

    render() {
        const {chats, messages, users, match} = this.props
        if(!chats){
            return null
        }
        const selectedChatId = match.params.id

        const selectedChat = chats.results.find(e=>e._id===selectedChatId)
        console.log('render ChatContainer')
        return <div className="chat-container">
            <div className="chat-container-left">
                <div className="chat-h3">{_t('ChatContainer.chats')}</div>
                <ul className="chat-channel-list">
                    {chats.results.map((chat, i) => {
                        /*if (chat._id === selectedChatId) {
                            selectedChat = chat
                        }*/
                        const url = CHAT_BASE_URL+ '/' + chat._id
                        return <li className={'chat-channel-list-item'+(selectedChatId===chat._id?' active':'')} key={i}>{['creating', 'deleting'].indexOf(chat.status) > -1 ? <>{chat.name}
                        </> : <>
                            <Link className="chat-channel-list-link" to={url}>
                                <img className="chat-channel-list-image" src={'/placeholder.svg'} />
                                {chat.name}
                            </Link>
                            <button className="chat-channel-list-delete-button" onClick={this.handleChatDeleteClick.bind(this, chat)}>x</button>
                        </>}
                        </li>
                    })}
                </ul>
                <CreateChat onClick={this.handleCreateChatClick}/>
            </div>
            <div className="chat-container-right">
            {selectedChat ?
                <>
                    <div className="chat-channel-head">
                        <div className="chat-h3">{selectedChat.name}</div>

                        <ul className="chat-channel-users">
                            {selectedChat.users.map((user, i) => {
                                if(!user){
                                    user = {}
                                }
                                const isCreator = user._id === selectedChat.createdBy._id
                                return <li key={i}
                                             className="chat-channel-user"
                                             style={{fontWeight: (isCreator ? 'bold' : 'normal')}}>
                                    <img className="chat-channel-user-image" src={user.picture?'/uploads/'+user.picture+'?format=jpeg&width=96&height=96':'/placeholder.svg'} />
                                    <div>{user.username}
                                    {isCreator || true? '' :<button onClick={this.handleRemoveUserFromChatClick.bind(this, selectedChat, user)}>x</button>}
                                    </div>
                                </li>
                            })}
                        </ul>
                        {users && <AddChatUser users={users.results} selectedUsers={selectedChat.users}
                                     onClick={this.handleAddChatUserClick}/>}
                    </div>
                    <div className="chat-channel-body" id="chatChannelBody">
                        {messages && messages.results.slice(0).reverse().map((message, i) => {

                            return <ChatMessage key={i} message={message} chat={selectedChat}
                                                onDeleteClick={this.handleMessageDeleteClick.bind(this, message)}/>
                        })}
                    </div>
                    <div className="chat-channel-foot">
                        <AddChatMessage onClick={this.handleAddChatMessageClick}/>
                    </div>
                </>
                : ''}
            </div>
            </div>
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

const queryMessageVariables = {sort:'_id desc', limit: 200}
export default compose(
    graphql('query users($sort:String,$limit:Int,$page:Int,$filter:String){users(sort:$sort,limit:$limit,page:$page,filter:$filter){limit offset total meta results{_id username picture{_id name} role{name}}}}', {
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
                variables: {filter:'chat=='+match.params.id, ...queryMessageVariables},
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {chatMessages}, ownProps}) => {
            return {
                messages: chatMessages,
                subscribeMessages: ()=>{

                    return client.subscribe({
                        query: `subscription subscribeChatMessage{subscribeChatMessage{action removedIds data{_id message chat{_id name} createdBy{username _id picture}}}}`
                    }).subscribe({
                        next({data:{subscribeChatMessage}}) {
                            const {data,removedIds, action} = subscribeChatMessage
                            if(action==='delete'){
                                removedIds.forEach(_id=>{
                                    const {match} = ownProps,
                                        variables = {filter:'chat=='+match.params.id, ...queryMessageVariables}

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
                                    filter: 'chat==' + message.chat._id,...queryMessageVariables
                                }
                                const storeData = client.readQuery({
                                    query: queriesMessage.query,
                                    variables
                                })
                                const newResults = storeData.chatMessages?[...storeData.chatMessages.results]:[]
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
                const createdBy = {
                    __typename: 'UserPublic',
                    _id: _app_.user._id,
                    username: _app_.user.username,
                    picture: _app_.user.picture ? _app_.user.picture._id : false
                }
                return mutate({
                    variables: {chat, message, readBy: [_app_.user._id]},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        createChatMessage: {
                            _id: oid,
                            status: 'creating',
                            createdBy,
                            chat: {
                                __typename: 'Chat',
                                _id: chat
                            },
                            readBy:[createdBy],
                            message,
                            __typename: 'Message'
                        }
                    },

                    update: (store, {data: {createChatMessage}}) => {
                        const {match} = ownProps,
                            variables = {filter:'chat=='+match.params.id, ...queryMessageVariables},
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
                            variables = {filter:'chat=='+match.params.id, ...queryMessageVariables},
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

