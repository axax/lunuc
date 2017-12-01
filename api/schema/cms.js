export const cmsSchemaRaw = `
    type CmsPage {
        _id: ID! 
        createdBy: UserPublic!
        slug: String 
        status: String
    }
    
    
    type CmsPageResult {
        results: [CmsPage]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	cmsPages(limit: Int=10, offset: Int=0): CmsPageResult
    	cmsPage(slug: String!): CmsPage
    }
    
		
	type Mutation {
		createCmsPage (
			slug: String!
		): CmsPage
		updateCmsPage(_id: ID!, slug: String!): CmsPage	
		deleteCmsPage(_id: ID!): CmsPage
	}
`