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
        subscriptions: [String],
        public: Boolean,
        urlSensitiv: Boolean,
        modifiedAt: Float
        cacheKey: String
    }
    
    
    type CmsPageResult {
        results: [CmsPage]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	cmsPages(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): CmsPageResult
    	cmsPage(slug: String!, query: String): CmsPage
    }
    
		
	type Mutation {
		createCmsPage (
			slug: String!
			public: Boolean
		): CmsPage
		updateCmsPage(_id: ID!, query: String, slug: String, template: String, script: String, dataResolver: String, ssr: Boolean, public: Boolean, urlSensitiv: Boolean): CmsPage	
		deleteCmsPage(_id: ID!): CmsPage
		cloneCmsPage(_id: ID!, slug: String, public: Boolean, urlSensitiv: Boolean): CmsPage
	}
`