export const chatSchemaRaw = `
  type Message {
  	_id: ID! # unique id for message
    to: Chat! # chat message was sent in
    from: User! # user who sent the message
    text: String! # message text
  }
  
	type Chat {
		_id: ID! # unique id for chat
    users: [User]! # users in the chat
    messages(limit: Int, offset: Int): [Message] # messages sent to the chat
  }
  
`