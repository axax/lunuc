export default `
 
	type Mutation {
		addUserToChat(userId: ID!, chatId: ID!): Chat
		removeUserFromChat(userId: ID!, chatId: ID!): Chat
	}	
`