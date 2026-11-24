import config from '../../../gensrc/config.mjs'
import Util from '../../../api/util/index.mjs'
import {getType, getTypes} from '../../../util/types.mjs'

export const SEARCH_COLLECTION = 'SearchIndex'

export const LANGUAGES = Array.isArray(config.LANGUAGES) && config.LANGUAGES.length > 0 ? config.LANGUAGES : ['de']
export const DEFAULT_LANGUAGE = config.DEFAULT_LANGUAGE || LANGUAGES[0]

// marker for entries that were built from values without language (they are found in every language)
export const ANY_LANGUAGE = '*'

// languages MongoDB text search supports (ISO 639-1), everything else is indexed without stemming
const TEXT_SEARCH_LANGUAGES = ['da', 'de', 'en', 'es', 'fi', 'fr', 'hu', 'it', 'nb', 'nl', 'pt', 'ro', 'ru', 'sv', 'tr']
export const textLanguage = (lang) => TEXT_SEARCH_LANGUAGES.includes(lang) ? lang : 'none'

const asArray = (value) => Array.isArray(value) ? value : (value ? [value] : [])

/*
 A type is indexed when its type definition (build.json) has "searchIndex":
   "searchIndex": true
       title: field "name" (or the first field), fields: all fields with searchable: true
   "searchIndex": {
       "title": ["name"],               fields that form the title (weighted higher)
       "fields": ["name", "keyword"],   indexed fields (default: fields with searchable: true)
       "includeSearchable": true,       additionally all fields with searchable: true
       "publicField": "public"          documents with this field === true can be found by everybody
   }
 GenericData: the type itself needs "searchIndex": true, which entries and fields are indexed is
 decided per GenericDataDefinition (structure.searchIndex, see sync.mjs).
 */
export const isIndexedType = (type) => {
    const typeDefinition = getType(type)
    return !!(typeDefinition && typeDefinition.searchIndex)
}

export const getIndexedTypes = () => Object.keys(getTypes()).filter(isIndexedType)

// {aliasName: path} of the fields with dynamic.action "alias" (e.g. imageDescription -> info.qwen25vl7b.description)
const aliasPaths = (typeDefinition) => {
    const paths = {}
    ;(typeDefinition.fields || []).forEach(f => {
        if (f && f.dynamic && f.dynamic.action === 'alias' && f.dynamic.path) {
            paths[f.name] = f.dynamic.path
        }
    })
    return paths
}

export const coreTypeConfig = (type) => {
    const typeDefinition = getType(type)
    let conf = typeDefinition && typeDefinition.searchIndex
    if (!conf || type === 'GenericData') return null
    if (conf === true) conf = {}
    const searchableFields = (typeDefinition.fields || []).filter(f => f.searchable).map(f => f.name)
    let fieldNames = conf.fields ? asArray(conf.fields) : searchableFields
    if (conf.fields && conf.includeSearchable) {
        fieldNames = [...fieldNames, ...searchableFields]
    }
    const titleFields = conf.title ? asArray(conf.title) : (fieldNames.includes('name') ? ['name'] : fieldNames.slice(0, 1))
    return {
        titleFields,
        fieldNames: [...new Set([...titleFields, ...fieldNames])],
        // alias fields (dynamic.action "alias") are read from their path, the alias stays the field name
        fieldPaths: aliasPaths(typeDefinition),
        publicField: conf.publicField
    }
}

export const DEFAULT_SETTINGS = {
    // max. characters of the indexed text of one entry
    maxTextLength: 20000
}

// installation specific settings: KeyValueGlobal "SearchIndexSettings", e.g. {"maxTextLength": 10000}
export const getSettings = async (db) => {
    let custom = null
    try {
        custom = await Util.getKeyValueGlobal(db, null, 'SearchIndexSettings', true)
    } catch (e) {
        console.warn('search: SearchIndexSettings could not be read', e.message)
    }
    return custom && custom.constructor === Object ? {...DEFAULT_SETTINGS, ...custom} : DEFAULT_SETTINGS
}
