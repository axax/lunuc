export default `
    type ChatMedia {
        _id: ID!
        name: String
        mimeType: String
    }

    type ChatMsg {
        _id: ID!
        chat: ID!
        message: String
        createdBy: UserPublic
        readBy: [ID]
        replyTo: String
        reactions: String
        media: [ChatMedia]
        edited: Boolean
        deleted: Boolean
        nonce: String
    }

    type ChatRoom {
        _id: ID!
        name: String
        direct: Boolean
        createdBy: ID
        users: [UserPublic]
        unread: Int
        muted: Boolean
        lastMessage: ChatMsg
    }

    type ChatEvent {
        type: String!
        chat: ID
        user: ID
        username: String
        message: ChatMsg
        room: ChatRoom
    }

    type Query {
        chatRooms: [ChatRoom]
        chatUsers(search: String): [UserPublic]
        chatRoomMessages(chat: ID!, before: ID, limit: Int): [ChatMsg]
    }

    type Mutation {
        chatCreateRoom(name: String, users: [ID]!, direct: Boolean): ChatRoom
        chatRenameRoom(chat: ID!, name: String!): ChatRoom
        chatAddUser(chat: ID!, user: ID!): ChatRoom
        chatRemoveUser(chat: ID!, user: ID!): ChatRoom
        chatDeleteRoom(chat: ID!): Boolean
        chatSend(chat: ID!, message: String, replyTo: ID, media: [ID], nonce: String): ChatMsg
        chatEdit(_id: ID!, message: String!): ChatMsg
        chatDelete(_id: ID!): ChatMsg
        chatReact(_id: ID!, emoji: String): ChatMsg
        chatMarkRead(chat: ID!): Boolean
        chatMute(chat: ID!, muted: Boolean!): Boolean
        chatTyping(chat: ID!): Boolean

        addUserToChat(userId: ID!, chatId: ID!): Chat
        removeUserFromChat(userId: ID!, chatId: ID!): Chat
    }

    type Subscription {
        subscribeChatEvent: ChatEvent
    }
`
