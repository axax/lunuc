import {toFlatRecord, fromFlatValues, toIso} from '../../extensions/genericdata/util/flatRecord.mjs'
import {signWebhookBody} from '../../extensions/genericdata/util/webhook.mjs'
import crypto from 'crypto'
import {ObjectId} from 'mongodb'
import {compileView, toViewRecord, parseViewFilter, checkUpsertBody, encodeCursor, decodeCursor} from '../../extensions/genericdata/util/scopedView.mjs'

const structure = {
    fields: [
        {name: 'playerId'},
        {name: 'status', uitype: 'select', enum: [{name: 'An', value: 'subscribed'}, {name: 'Ab', value: 'unsubscribed'}]},
        {name: 'consentAt', type: 'Float', uitype: 'datetime'},
        {name: 'unsubscribedAt', type: 'Float', uitype: 'datetime'}
    ]
}

describe('toFlatRecord', () => {
    it('flattens data, converts date fields and modifiedAt to iso', () => {
        const ms = Date.UTC(2026, 10, 3, 18, 30)
        const rec = toFlatRecord({_id: 'abc', modifiedAt: ms, data: {playerId: '12345', status: 'subscribed', consentAt: ms, unsubscribedAt: null}}, {structure})
        expect(rec).toEqual({
            _id: 'abc', playerId: '12345', status: 'subscribed',
            consentAt: '2026-11-03T18:30:00.000Z', unsubscribedAt: null, updatedAt: '2026-11-03T18:30:00.000Z'
        })
    })

    it('parses data given as json string and respects the field whitelist', () => {
        const rec = toFlatRecord({_id: 'x', data: JSON.stringify({playerId: '1', email: 'a@b.ch', secret: 'no'})}, {structure, fields: ['playerId', 'email']})
        expect(rec).toEqual({_id: 'x', playerId: '1', email: 'a@b.ch', updatedAt: null})
    })

    it('returns null for invalid dates', () => {
        expect(toIso('nonsense')).toBe(null)
        expect(toIso(undefined)).toBe(null)
    })
})

describe('fromFlatValues', () => {
    it('converts iso strings of date fields to ms', () => {
        expect(fromFlatValues({status: 'unsubscribed', unsubscribedAt: '2026-11-03T19:00:00Z'}, structure))
            .toEqual({status: 'unsubscribed', unsubscribedAt: Date.UTC(2026, 10, 3, 19)})
    })

    it('rejects invalid dates and values outside the enum', () => {
        expect(() => fromFlatValues({unsubscribedAt: 'tomorrow'}, structure)).toThrow('invalid date')
        expect(() => fromFlatValues({status: 'maybe'}, structure)).toThrow('invalid value for field status')
    })
})

describe('signWebhookBody', () => {
    it('creates a verifiable hmac signature', () => {
        const body = '{"a":1}'
        const sig = signWebhookBody('secret', body, 1700000000)
        const expected = crypto.createHmac('sha256', 'secret').update('1700000000.' + body).digest('hex')
        expect(sig).toBe(`t=1700000000,v1=${expected}`)
    })
})


describe('scopedView', () => {
    const view = {
        type: 'User',
        match: {domain: 'x'},
        fields: {playerId: ['meta.virtualId', '_id'], firstName: 'meta.addresses.0.firstname', status: 'meta.c.status', consentAt: 'meta.c.consentAt'},
        dateFields: ['consentAt']
    }

    it('projects only the mapped paths (no array index, no colliding paths)', () => {
        expect(compileView(view).projection).toEqual({_id: 1, 'meta.addresses': 1, 'meta.c.consentAt': 1, 'meta.c.status': 1, 'meta.virtualId': 1, modifiedAt: 1})
    })

    it('maps a document to a record with fallback paths and iso dates', () => {
        const _id = new ObjectId()
        const rec = toViewRecord({_id, modifiedAt: 0, password: 'x', meta: {addresses: [{firstname: 'Max'}], c: {status: 'subscribed', consentAt: 0}}}, compileView(view))
        expect(rec).toEqual({_id: _id.toString(), playerId: _id.toString(), firstName: 'Max', status: 'subscribed', consentAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z'})
    })

    it('only filters on fields of the view', () => {
        expect(parseViewFilter(compileView(view), 'status==subscribed')).toEqual([{'meta.c.status': 'subscribed'}])
        expect(() => parseViewFilter(compileView(view), 'password==x')).toThrow()
    })

    it('checks writes against the upsert config', () => {
        const conf = {keys: ['playerId'], fields: ['status'], values: {status: ['unsubscribed']}, required: ['status'], set: {source: 'office'}}
        expect(checkUpsertBody(conf, ['playerId'], {playerId: '1', status: 'unsubscribed'}, true)).toEqual({values: {status: 'unsubscribed', source: 'office'}})
        expect(checkUpsertBody(conf, ['playerId'], {playerId: '1', status: 'subscribed'}, true).error[0]).toBe(403)
        expect(checkUpsertBody(conf, ['playerId'], {playerId: '1', email: 'a'}, true).error[0]).toBe(403)
        expect(checkUpsertBody(conf, ['email'], {email: 'a'}, true).error[0]).toBe(400)
    })

    it('round trips the cursor', () => {
        const id = new ObjectId()
        expect(decodeCursor(encodeCursor(5, id))).toEqual({m: 5, i: id.toString()})
        expect(decodeCursor('nonsense')).toBe(null)
    })
})
