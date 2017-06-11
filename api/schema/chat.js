export const chatSchemaRaw = `
  type Message {
  	_id: ID! # unique id for message
    to: Chat! # chat message was sent in
    from: User! # user who sent the message
    text: String! # message text
  }
  
	type Chat {
		_id: ID! # unique id for chat
		name: String! # name of the chat
		createdBy: User! # id of user
    users: [User]! # users in the chat
    messages(limit: Int, offset: Int): [Message] # messages sent to the chat
  }
  
  
  type Query {
    chats(limit: Int, offset: Int): [Chat]
  }
  
	type Mutation {
		createChat(name: String!): Chat	
		joinChat(chatId: String!,username: String!): Chat
		leaveChat(chatId: String!,username: String!): Chat
	}
	
	
	type Subscription {
		newMessage: Message
	}
	
`