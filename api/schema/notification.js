export const notificationSchemaRaw = `

    type Notification {
        key: String!
        message: String
        link: String
        linkText: String
    }
    
    type Query {
        notifications: [Notification]
    }
 
    type Subscription {
        newNotification: Notification
    }
`