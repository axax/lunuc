export default `

    type NewsletterSendStatus{
        status:String
    }

    type Query {
    	confirmNewsletter(token: String!,location: String): NewsletterSubscriberStatus
    	subscribeNewsletter(email: String!,location: String,meta: String,list:[ID], fromEmail: String, fromName: String, confirmSlug: String): NewsletterSubscriberStatus
    	unsubscribeNewsletter(email: String!,location: String,token: String!, mailing: ID): NewsletterSubscriberStatus
    	sendNewsletter(mailing: ID!, subject: LocalizedStringInput!, template: String!, list:[ID], batchSize: Float, text: LocalizedStringInput): NewsletterSendStatus
    }
    
`
