export default `

type Query {
    cmsPage(slug: String!, props: String, query: String, nosession: String, _version: String): CmsPage
}
`
