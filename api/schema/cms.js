export const cmsSchemaRaw = `
    type CmsPage {
        _id: ID! 
        createdBy: UserPublic!
        name: String 
        slug: String 
        template: String 
        script: String
        dataResolver: String
        resolvedData: String
        html: String 
        style: String 
        status: String
        ssr: Boolean,
        subscriptions: [String],
        public: Boolean,
        online: Boolean,
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
    	cmsPages(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String, version: String): CmsPageResult
    	cmsPage(slug: String!, query: String, nosession: String, version: String): CmsPage
    }
    
		
	type Mutation {
		createCmsPage (
		    _version: String
			slug: String!
			public: Boolean,
			urlSensitiv: Boolean
		): CmsPage
		updateCmsPage(_id: ID!,_version: String, query: String, name: String, slug: String, template: String, script: String, style: String, dataResolver: String, ssr: Boolean, public: Boolean, urlSensitiv: Boolean): CmsPage	
		deleteCmsPage(_id: ID!,_version: String): CmsPage
		cloneCmsPage(_id: ID!,_version: String, slug: String, public: Boolean, urlSensitiv: Boolean): CmsPage
	}
`