import {ObjectId} from 'mongodb'
import AggregationBuilder from '../../api/resolver/generic/AggregationBuilderV2.mjs'
import Util from '../../api/util/index.mjs'

describe('free search term that is an ObjectId', () => {
    const builder = Object.create(AggregationBuilder.prototype)

    it('adds an _id match to the term slot', () => {
        const filters = Util.parseFilterV2('6a79c44c725266eae151b876')
        const match = []
        builder._addObjectIdRestMatches(filters, match)
        const rest = builder._buildRestQuery(match.$$restQuery)
        expect(JSON.stringify(rest)).toContain('6a79c44c725266eae151b876')
        expect(match.$$restQuery[0].$[0]._id).toBeInstanceOf(ObjectId)
    })

    it('ignores other terms', () => {
        const filters = Util.parseFilterV2('etoro 6a79c44c')
        const match = []
        builder._addObjectIdRestMatches(filters, match)
        expect(match.$$restQuery).toBeUndefined()
    })
})
