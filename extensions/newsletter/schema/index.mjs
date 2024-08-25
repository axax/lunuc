export default `

    type NewsletterSendStatus{
        status:String
    }

    type Query {
    	confirmNewsletter(token: String!,location: String): NewsletterSubscriberStatus
    	subscribeNewsletter(email: String!,location: String,meta: String,list:[ID], replyTo: String,fromEmail: String, fromName: String, confirmSlug: String): NewsletterSubscriberStatus
    	unsubscribeNewsletter(email: String!,location: String,token: String!, mailing: ID): NewsletterSubscriberStatus
    	sendNewsletter(mailing: ID!, subject: LocalizedStringInput, template: String, list:[ID], users:[ID], unsubscribeHeader: Boolean, batchSize: Float, host: String, text: LocalizedStringInput, html: LocalizedStringInput, testReceiver: String): NewsletterSendStatus
    }
    
`
