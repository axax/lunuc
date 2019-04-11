export default `

type Query {
    cmsPage(slug: String!, query: String, nosession: String, _version: String): CmsPage
}
`
