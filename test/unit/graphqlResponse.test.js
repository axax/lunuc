/*
 * Response body of /graphql: for cmsPage the null values inside data are left out - same result as
 * the former removeNullsMutating (kept here as reference), without changing the data.
 */
import assert from 'node:assert'
import {graphqlResponseJson} from '../../api/util/graphqlResponse.mjs'

function removeNullsMutating(obj) {
    if (Array.isArray(obj)) {
        for (let i = obj.length - 1; i >= 0; i--) {
            if (obj[i] === null || obj[i] === undefined) {
                obj.splice(i, 1)
            } else {
                removeNullsMutating(obj[i])
            }
        }
    } else if (obj !== null && typeof obj === 'object') {
        for (const key in obj) {
            if (obj[key] === null || obj[key] === undefined) {
                delete obj[key]
            } else {
                removeNullsMutating(obj[key])
            }
        }
    }
    return obj
}
const formerJson = (body) => {
    if (body?.data?.cmsPage) {
        body.data = removeNullsMutating(body.data)
    }
    return JSON.stringify(body)
}

const bodies = {
    cmsPage: () => ({data: {cmsPage: {slug: 'a', meta: null, name: {de: 'x', en: null}, list: [1, null, {a: null, b: [null, undefined, 2]}], empty: [null]}}, isAuth: true}),
    cmsPageWithErrors: () => ({errors: [{message: 'x', data: {a: null}, path: ['cmsPage', null]}], data: {cmsPage: {a: null, b: 1}}, isAuth: false}),
    otherQuery: () => ({data: {users: {results: [{name: null}], total: null}}, isAuth: true}),
    noData: () => ({errors: [{message: 'Must provide query string.'}], isAuth: false}),
    dollarInData: () => ({data: {cmsPage: {template: 'cost $& and $1 $$'}}, isAuth: true})
}

describe('graphql response json', () => {
    for (const [name, create] of Object.entries(bodies)) {
        it(`same as before: ${name}`, () => {
            assert.strictEqual(graphqlResponseJson(create()), formerJson(create()))
        })
    }
    it('does not change the data', () => {
        const body = bodies.cmsPage()
        graphqlResponseJson(body)
        assert.strictEqual(body.data.cmsPage.meta, null)
    })
})
