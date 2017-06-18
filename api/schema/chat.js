export const chatSchemaRaw = `
  type Message {
  	_id: ID! # unique id for message
    to: Chat! # chat message was sent in
    from: UserPublic! # user who sent the message
    text: String! # message text
  }
  
	type Chat {
		_id: ID! # unique id for chat
		name: String! # name of the chat
		createdBy: UserPublic! # id of user
    users: [UserPublic]! # users in the chat
    messages(limit: Int, offset: Int): [Message] # messages sent to the chat
  }
  
  
  type Query {
    chat(chatId: String!,limit: Int, offset: Int): Chat
    chats(limit: Int, offset: Int): [Chat]
    chatsWithMessages(limit: Int, offset: Int): [Chat]
  }
  
	type Mutation {
		createChat(name: String!): Chat	
		createMessage(chatId: ID!, text: String!): Message
		
		
		
		addUserToChat(userId: ID!, chatId: ID!): Chat
		removeUserToChat(userId: ID!, chatId: ID!): Chat
	}
	
	
	type Subscription {
		newMessage: Message
	}
	
`