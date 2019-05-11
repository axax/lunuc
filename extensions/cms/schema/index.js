export default `

type Query {
    cmsPage(slug: String!, props: String, query: String, nosession: String, editmode: Boolean, _version: String): CmsPage
}
`
