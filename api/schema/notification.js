export const notificationSchemaRaw = `

	type Notification {
    key: String!
    message: String
  }
  
  type Query {
    notifications: [Notification]

  }
 
	type Subscription {
		notification: Notification
	}
`