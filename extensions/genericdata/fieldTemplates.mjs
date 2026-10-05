/**
 * Lets a field use the value of the same field of another entry of the same generic type
 * as template, e.g. the CmsEditor field in the GenericForm.
 *
 * The entries are loaded with GenericResolver.entities, so the same access rules apply as
 * for the normal list. Only labels (and later one value) are sent to the client.
 */
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import Util from '../../api/util/index.mjs'
import ClientUtil from '../../client/util/index.mjs'
import {getGenericTypeDefinitionWithStructure} from './util/index.mjs'

export const schema = `
type GenericDataFieldTemplate {
    _id: ID
    label: String
    modifiedAt: Float
}
type GenericDataFieldTemplateValue {
    _id: ID
    value: String
}
type Query {
    genericDataFieldTemplates(genericType: String!, field: String!, excludeId: ID, limit: Int): [GenericDataFieldTemplate]
    genericDataFieldTemplateValue(genericType: String!, field: String!, _id: ID!): GenericDataFieldTemplateValue
}
`

const FIELD_NAME = /^[A-Za-z0-9_$-]+$/

const parseData = (data) => {
    if (data && typeof data === 'string') {
        try {
            return JSON.parse(data)
        } catch (e) {
            return {}
        }
    }
    return data || {}
}

const toText = (value, lang) => {
    if (value === null || value === undefined) {
        return ''
    }
    if (typeof value === 'object') {
        // localized value
        return value[lang] || Object.values(value).find(v => typeof v === 'string' && v) || ''
    }
    return String(value)
}

const hasValue = (value) => value !== undefined && value !== null && value !== '' &&
    !(typeof value === 'object' && Object.keys(value).length === 0)

/**
 * same rules as the label in the type picker: titleTemplate, pickerField, title, first field
 */
const labelForItem = (structure, item, data, lang) => {
    if (structure.titleTemplate) {
        try {
            const label = ClientUtil.replacePlaceholders(structure.titleTemplate, {Util: ClientUtil, ...item, data})
            if (label) {
                return label.replace(/<[^>]*>/g, '')
            }
        } catch (e) {
        }
    }
    let pickerFields = structure.pickerField || (data.title !== undefined ? 'title' : Object.keys(data)[0])
    if (!pickerFields) {
        return String(item._id)
    }
    if (!Array.isArray(pickerFields)) {
        pickerFields = [pickerFields]
    }
    const label = pickerFields.map(f => toText(data[f], lang)).filter(Boolean).join(' | ')
    return label || String(item._id)
}

const loadDefinition = async (db, genericType, field) => {
    if (!FIELD_NAME.test(field)) {
        throw new Error(`invalid field ${field}`)
    }
    const def = await getGenericTypeDefinitionWithStructure(db, {name: genericType})
    if (!def || !def.structure) {
        throw new Error(`Invalid type GenericType.${genericType}`)
    }
    return def
}

export const resolver = (db) => ({
    Query: {
        genericDataFieldTemplates: async ({genericType, field, excludeId, limit}, req) => {
            Util.checkIfUserIsLoggedIn(req.context)
            const def = await loadDefinition(db, genericType, field)

            const result = await GenericResolver.entities(db, req, 'GenericData', ['data', 'modifiedAt'], {
                genericType,
                limit: Math.min(limit || 200, 500),
                sort: '_id desc',
                returnMeta: false
            })

            const lang = req.context && req.context.lang
            const templates = []
            ;(result.results || []).forEach(item => {
                if (!item || (excludeId && String(item._id) === String(excludeId))) {
                    return
                }
                const data = parseData(item.data)
                if (!hasValue(data[field])) {
                    // nothing to take over
                    return
                }
                templates.push({_id: item._id, label: labelForItem(def.structure, item, data, lang), modifiedAt: item.modifiedAt})
            })
            return templates
        },
        genericDataFieldTemplateValue: async ({genericType, field, _id}, req) => {
            Util.checkIfUserIsLoggedIn(req.context)
            await loadDefinition(db, genericType, field)

            const result = await GenericResolver.entities(db, req, 'GenericData', ['data'], {
                genericType,
                filter: `_id=${_id}`,
                limit: 1,
                returnMeta: false
            })
            const item = result.results && result.results[0]
            if (!item) {
                throw new Error('entry not found')
            }
            const value = parseData(item.data)[field]
            return {
                _id: item._id,
                value: value === undefined || value === null ? '' : (typeof value === 'string' ? value : JSON.stringify(value))
            }
        }
    }
})
