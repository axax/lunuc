export default `

    type Query {
    	subscribeNewsletter(email: String!,meta: String,list:[ID]): NewsletterSubscriberStatus
    }
    
`
