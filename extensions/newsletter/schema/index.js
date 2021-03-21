export default `

    type NewsletterSendStatus{
        status:String
    }

    type Query {
    	subscribeNewsletter(email: String!,location: String,meta: String,list:[ID]): NewsletterSubscriberStatus
    	unsubscribeNewsletter(email: String!, token: String!, mailing: ID): NewsletterSubscriberStatus
    	sendNewsletter(mailing: ID!, subject: String!, template: String!, list:[ID], batchSize: Float, text: String): NewsletterSendStatus
    }
    
`
