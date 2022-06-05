export default `

    type BotMessageResult {
        response: String
        id: String
        sessionId: String
        message_id: String
        event: String
        username: String
        user_id: String
        user_image: String
        botId: String
        botName: String
        isBot: Boolean
        meta: String
    }
    
    type Query {
    	sendBotMessage(command: String, message: String, botId: String!, id: String, meta: String): BotMessageResult
    }
    
    type Subscription{
        subscribeBotMessage(id: String): BotMessageResult
    }
`
