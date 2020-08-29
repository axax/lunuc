export default `

    type NewsletterSendStatus{
        status:String
    }

    type Query {
    	subscribeNewsletter(email: String!,meta: String,list:[ID]): NewsletterSubscriberStatus
    	unsubscribeNewsletter(email: String!, token: String!): NewsletterSubscriberStatus
    	sendNewsletter(subject: String!, template: String!, list:[ID]): NewsletterSendStatus
    }
    
`
