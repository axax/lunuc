export default `

type Query {
    cmsPage(slug: String!, query: String, fetchMore: String, nosession: String, _version: String): CmsPage
}
`
