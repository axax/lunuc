export default `
    type PushInfo {
        publicKey: String
        subscribed: Boolean
        devices: Int
        settings: String
        topics: [String]
    }

    type Query {
        pushInfo(endpoint: String): PushInfo
    }

    type Mutation {
        pushSubscribe(subscription: String!, topics: [String], settings: String): Boolean
        pushSettings(endpoint: String!, settings: String, topics: [String]): Boolean
        pushUnsubscribe(endpoint: String!): Boolean
        pushTest: Int
    }
`
