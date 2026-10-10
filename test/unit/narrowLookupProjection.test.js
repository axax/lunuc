import {narrowLookupProjection, referencesSubField} from '../../extensions/genericdata/narrowLookupProjection.mjs'

const USER_T = ['_id', 'email', 'username', 'meta', 'picture', 'role']
const USER_R = ['_id', 'email', 'username', 'meta', 'picture']

describe('narrowLookupProjection', () => {
    test('teilnehmer list: only _id and username', () => {
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1}, 'teilnehmer', {}))
            .toEqual(['_id', 'username'])
    })

    test('rangliste: dotted meta paths, metaValues (not in whitelist) dropped', () => {
        const req = {_id: 1, picture: 1, username: 1, 'meta.hide': 1, 'meta.hideName': 1, 'meta.hidePayout': 1, 'meta.addresses': 1, metaValues: 1}
        expect(narrowLookupProjection(USER_R, req, 'rangliste', {}))
            .toEqual(['_id', 'picture', 'username', 'meta.hide', 'meta.hideName', 'meta.hidePayout', 'meta.addresses'])
    })

    test('never extends the whitelist', () => {
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1, password: 1}, 'teilnehmer', {}))
            .toEqual(['_id', 'username'])
    })

    test('placeholders from dataResolver templates are ignored', () => {
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1, '': 1, '#': 1}, 'teilnehmer', {}))
            .toEqual(['_id', 'username'])
    })

    test('_id is added when missing', () => {
        expect(narrowLookupProjection(USER_T, {username: 1}, 'teilnehmer', {})).toEqual(['_id', 'username'])
    })

    test('parent and child path: parent wins', () => {
        expect(narrowLookupProjection(USER_T, {_id: 1, meta: 1, 'meta.hide': 1}, 'x', {})).toEqual(['_id', 'meta'])
    })

    test('nothing usable left -> full whitelist (null)', () => {
        expect(narrowLookupProjection(USER_T, {metaValues: 1}, 'rangliste', {})).toBe(null)
        expect(narrowLookupProjection(USER_T, {_id: 1}, 'rangliste', {})).toBe(null)
    })

    test('filter on a sub field of the reference -> no narrowing', () => {
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1}, 'teilnehmer',
            {filter: 'data.teilnehmer.email==a@b.ch'})).toBe(null)
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1}, 'teilnehmer',
            {sort: 'data.teilnehmer.meta.x asc'})).toBe(null)
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1}, 'teilnehmer',
            {lookupFilter: {'data.teilnehmer.role': 'x'}})).toBe(null)
    })

    test('filter on _id or the raw field keeps narrowing', () => {
        const f = '(data.teilnehmer._id==[6437] || data.teilnehmer==[6437]) && data.status!==private'
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1}, 'teilnehmer', {filter: f}))
            .toEqual(['_id', 'username'])
    })

    test('can be switched off', () => {
        expect(narrowLookupProjection(USER_T, {_id: 1, username: 1}, 'teilnehmer', {narrowLookupProjection: false})).toBe(null)
    })
})

describe('referencesSubField', () => {
    test('word boundaries', () => {
        expect(referencesSubField('teilnehmer', {filter: 'data.alleteilnehmer.email==x'})).toBe(false)
        expect(referencesSubField('teilnehmer', {filter: 'data.teilnehmer._idx==x'})).toBe(true)
        expect(referencesSubField('teilnehmer', {filter: 'data.teilnehmer._id==x'})).toBe(false)
    })
})
