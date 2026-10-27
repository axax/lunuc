export default `

    type NewsletterSendStatus{
        status:String
    }

    type SubscriberFileColumn{
        index: Int
        name: String
        samples: [String]
        filled: Int
    }

    type SubscriberFileInfo{
        sheets: [String]
        sheet: String
        headerRow: Int
        rowCount: Int
        emailColumn: Int
        columns: [SubscriberFileColumn]
    }

    type SubscriberImportResult{
        total: Int
        created: Int
        updated: Int
        unchanged: Int
        skippedUnsubscribed: Int
        invalid: Int
        empty: Int
        duplicates: Int
        invalidExamples: [String]
        dryRun: Boolean
    }

    type SubscriberRemoveResult{
        total: Int
        removed: Int
        notInList: Int
        notFound: Int
        invalid: Int
        empty: Int
        duplicates: Int
        invalidExamples: [String]
        dryRun: Boolean
    }

    type Query {
    	confirmNewsletter(token: String!,location: String): NewsletterSubscriberStatus
    	subscribeNewsletter(email: String!,location: String,meta: String,list:[ID], replyTo: String,fromEmail: String, fromName: String, confirmSlug: String): NewsletterSubscriberStatus
    	unsubscribeNewsletter(email: String!,location: String,token: String!, mailing: ID): NewsletterSubscriberStatus
    	sendNewsletter(mailing: ID!, subject: LocalizedStringInput, template: String, list:[ID], exclude:[ID], users:[ID], unsubscribeHeader: Boolean, batchSize: Float, host: String, text: LocalizedStringInput, html: LocalizedStringInput, testReceiver: String): NewsletterSendStatus
    }
    
    type Mutation {
        removeSubscribersFromLists(data: String!, sheet: String, headerRow: Int!, emailColumn: Int!, lists: [ID], dryRun: Boolean): SubscriberRemoveResult
        analyzeSubscriberFile(data: String!, sheet: String, headerRow: Int): SubscriberFileInfo
        importSubscribers(data: String!, sheet: String, headerRow: Int!, emailColumn: Int!, metaMapping: String, fixedMeta: String, lists: [ID], overwrite: Boolean, keepUnsubscribed: Boolean, state: String, confirmed: Boolean, language: String, dryRun: Boolean): SubscriberImportResult
    }
`
