export default `

    # Same as above but with ids resolved
    type Message {
        _id: ID! # unique id for message
        to: Chat! # chat message was sent in
        from: UserPublic! # user who sent the message
        text: String! # message text
        status: String # status of the message
    }
  
    type Chat {
		_id: ID! # unique id for chat
		name: String! # name of the chat
		createdBy: UserPublic! # id of user
        users: [UserPublic]! # users in the chat
        messageCount: Int # returns the total number of messages
        messages(limit: Int, offset: Int): [Message] # messages sent to the chat
        status: String # status of the chat
    }
  
  
  type Query {
    chat(chatId: String!, messageLimit: Int=10, messageOffset: Int=0): Chat
    chatMessages(chatId: String!, messageLimit: Int=10, messageOffset: Int=0): [Message]
    chats(limit: Int=10, offset: Int=0): [Chat]
    chatsWithMessages(limit: Int=10, offset: Int=0, messageLimit: Int=10, messageOffset: Int=0): [Chat]
  }
  
	type Mutation {
		createChat(name: String!): Chat	
		deleteChat(chatId: ID!): Chat	
		createMessage(chatId: ID!, text: String!): Message
		deleteMessage(messageId: ID!, chatId: ID): Message #chatId is optional. you can set it if you need it in the response
		
		
		addUserToChat(userId: ID!, chatId: ID!): Chat
		removeUserFromChat(userId: ID!, chatId: ID!): Chat
	}
	
	type Subscription {
		messageCreated: Message
		messageDeleted: Message
	}
	
`