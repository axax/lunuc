/*
 * Local backup (draft) of cms page changes that could not be saved yet.
 *
 * Written only when there is something unsaved at a critical moment (save failed, conflict, page is
 * closed while a save is pending) - not on every change. Removed as soon as the values are saved.
 * When the page is opened again, the draft is only offered if it still differs from the server.
 *
 * The storage is passed in (localStorage in the browser), so everything here can be tested.
 */
import {contentVersion, VERSIONED_FIELDS} from './contentVersion.mjs'

export const DRAFT_PREFIX = 'lunucCmsDraft:'
export const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000

export const draftKey = (pageId, version) => DRAFT_PREFIX + (version || '') + ':' + pageId

/**
 * @param values {field: unsaved value}
 * @param baseValues {field: [server values the change can be based on]} - a value that may still be
 *        on its way to the server is a valid base as well
 */
export const createDraft = ({pageId, slug, values, baseValues, now}) => {
    const draftValues = {}, base = {}
    Object.keys(values || {}).forEach(field => {
        if (VERSIONED_FIELDS.indexOf(field) >= 0 && typeof values[field] === 'string') {
            draftValues[field] = values[field]
            // a field that was never saved has the base undefined (contentVersion: '')
            const bases = baseValues && Object.prototype.hasOwnProperty.call(baseValues, field) ? [].concat(baseValues[field]) : []
            base[field] = bases.map(contentVersion)
        }
    })
    if (Object.keys(draftValues).length === 0) {
        return null
    }
    return {v: 1, pageId, slug, time: now, values: draftValues, base}
}

const isDraftShape = (draft) => !!draft && typeof draft === 'object' && draft.v === 1 &&
    draft.values && typeof draft.values === 'object' && draft.base && typeof draft.base === 'object'

export const readDraft = (storage, key) => {
    if (!storage) {
        return null
    }
    try {
        const raw = storage.getItem(key)
        if (!raw) {
            return null
        }
        const draft = JSON.parse(raw)
        return isDraftShape(draft) ? draft : null
    } catch (e) {
        return null
    }
}

export const removeDraft = (storage, key) => {
    if (!storage) {
        return
    }
    try {
        storage.removeItem(key)
    } catch (e) {
    }
}

/**
 * removes expired or broken drafts (all pages), except keepKey
 */
export const pruneDrafts = (storage, now, keepKey) => {
    if (!storage) {
        return
    }
    try {
        const keys = []
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i)
            if (key && key.indexOf(DRAFT_PREFIX) === 0 && key !== keepKey) {
                keys.push(key)
            }
        }
        keys.forEach(key => {
            const draft = readDraft(storage, key)
            if (!draft || !(now - draft.time < DRAFT_MAX_AGE)) {
                removeDraft(storage, key)
            }
        })
    } catch (e) {
    }
}

/**
 * @returns true if the draft was stored. A full storage is cleaned up once (other drafts), never thrown
 */
export const writeDraft = (storage, key, draft, now) => {
    if (!storage || !draft) {
        return false
    }
    const raw = JSON.stringify(draft)
    try {
        storage.setItem(key, raw)
        return true
    } catch (e) {
        // quota exceeded: drop old drafts of other pages and try once more
        try {
            pruneDrafts(storage, now, key)
            storage.setItem(key, raw)
            return true
        } catch (e2) {
            return false
        }
    }
}

/**
 * compares a draft with the values on the server
 * @returns {status: 'none'|'saved'|'restorable'|'stale', values, fields, time}
 *   none:       no (valid) draft, or older than DRAFT_MAX_AGE
 *   saved:      the server already has all values of the draft
 *   restorable: the server values are still the ones the draft is based on
 *   stale:      someone saved one of the fields meanwhile, restoring overwrites that change
 */
export const evaluateDraft = (draft, serverValues, now) => {
    if (!isDraftShape(draft) || !(now - draft.time < DRAFT_MAX_AGE)) {
        return {status: 'none', values: {}, fields: []}
    }
    const server = serverValues || {}
    const values = {}
    Object.keys(draft.values).forEach(field => {
        const value = draft.values[field]
        if (VERSIONED_FIELDS.indexOf(field) >= 0 && typeof value === 'string' && value !== server[field]) {
            values[field] = value
        }
    })
    const fields = Object.keys(values)
    if (fields.length === 0) {
        return {status: 'saved', values, fields, time: draft.time}
    }
    const stale = fields.some(field => {
        const bases = Array.isArray(draft.base[field]) ? draft.base[field] : []
        return bases.indexOf(contentVersion(server[field])) < 0
    })
    return {status: stale ? 'stale' : 'restorable', values, fields, time: draft.time}
}
