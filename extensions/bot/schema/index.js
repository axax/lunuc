export default `

    type TelegramResult {
        response: String
    }
    
    type Query {
    	sendTelegramMessage(message: String!): TelegramResult
    }
`