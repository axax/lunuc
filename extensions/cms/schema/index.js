export default `

type CmsServerMethod{
    result: String
}
type CmsCustomData{
    data: String
}
type CmsPageStatus{
    user: UserPublic    
}
type Query {
    cmsPage(slug: String!, props: String, query: String, nosession: String, editmode: Boolean, _version: String): CmsPage
    cmsServerMethod(slug: String!, methodName: String!, args: String, props: String, query: String, _version: String): CmsServerMethod
    cmsPageStatus(slug: String!): CmsPageStatus
}

type Subscription{
    cmsPageData: CmsPage
    cmsCustomData: CmsCustomData
}
`
