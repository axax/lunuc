export const cmsSchemaRaw = `
    type CmsPage {
        _id: ID! 
        createdBy: UserPublic!
        slug: String 
        template: String 
        script: String
        dataResolver: String
        resolvedData: String
        html: String 
        status: String
        ssr: Boolean,
        subscriptions: [String]
    }
    
    
    type CmsPageResult {
        results: [CmsPage]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	cmsPages(limit: Int=10, offset: Int=0, sort: String): CmsPageResult
    	cmsPage(slug: String!, query: String): CmsPage
    }
    
		
	type Mutation {
		createCmsPage (
			slug: String!
		): CmsPage
		updateCmsPage(_id: ID!, slug: String, template: String, script: String, dataResolver: String, ssr: Boolean): CmsPage	
		deleteCmsPage(_id: ID!): CmsPage
	}
`