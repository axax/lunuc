export default `

    type Query {
    	subscribeNewsletter(email: String!,list:[ID]): NewsletterSubscriberStatus
    }
    
`