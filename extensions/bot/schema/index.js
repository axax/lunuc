export default `

    type BotMessageResult {
        response: String
        id: String
        message_id: String
        event: String
        username: String
    }
    
    type Query {
    	sendBotMessage(message: String!, botId: String!, id: String): BotMessageResult
    }
    
    type Subscription{
        subscribeBotMessage(id: String): BotMessageResult
    }
`
