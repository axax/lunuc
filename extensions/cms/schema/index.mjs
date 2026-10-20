export default `

type CmsServerMethod{
    result: String
}
type CmsCustomData{
    data: String
}
type CmsPageStatus{
    user: UserPublic  
    data: String  
    editors: String
}

type CmsPageEditors{
    slug: String
    editors: String
}

type CmsPageChanged{
    slug: String
    userId: ID
    username: String
    modifiedAt: String
    fields: [String]
}

type CmsPageGroupResult{
    name: String,
    path: String,
    firstSlug: String,
    firstPublic:Boolean,
    childrenCount: Int
}

type CmsPagesExport{
    name: String
    data: String
    count: Int
}

type CmsPagesImportResult{
    created: Int
    updated: Int
    unchanged: Int
    skipped: Int
    slugs: [String]
    errors: [String]
}

type Query {
    exportCmsPages(ids:[ID], slugs:[String], _version: String): CmsPagesExport
    cmsPageGroups(path:String,_version: String): [CmsPageGroupResult]
    cmsPage(slug: String!, props: String, query: String, nosession: String, editmode: Boolean, inEditor: Boolean, meta: String, dynamic: Boolean, _version: String): CmsPage
    cmsServerMethod(slug: String!, methodName: String!, args: String, props: String, query: String, _version: String, dynamic: Boolean): CmsServerMethod
    cmsPageStatus(slug: String!): CmsPageStatus
    # which saves of a page really changed a field: json {historyId: true|false} (revision view filter)
    cmsPageHistoryChanges(_id: ID!, field: String!, limit: Int): String
    cmsPageActivity(slug: String!, typing: Boolean, elementKey: String, elementLabel: String): CmsPageStatus
}

type Mutation {
    importCmsPages(data: String!, _version: String, createMissing: Boolean, dryRun: Boolean): CmsPagesImportResult
}

type Subscription{
    cmsPageData: CmsPage
    cmsCustomData(filter:String): CmsCustomData
    cmsPageEditors(slug: String): CmsPageEditors
    cmsPageChanged(slug: String): CmsPageChanged
}
`
