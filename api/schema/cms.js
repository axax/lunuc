export const cmsSchemaRaw = `
    type CmsPage {
        _id: ID! 
        createdBy: UserPublic!
        slug: String 
        status: String
    }
    
    type Query {
    	cmsPages(limit: Int=10, offset: Int=0): [CmsPage]
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