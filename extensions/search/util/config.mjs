import config from '../../../gensrc/config.mjs'
import Util from '../../../api/util/index.mjs'

export const SEARCH_COLLECTION = 'SearchIndex'

// types whose documents are indexed
export const INDEXED_TYPES = ['GenericData', 'CmsPage', 'Media']

export const LANGUAGES = Array.isArray(config.LANGUAGES) && config.LANGUAGES.length > 0 ? config.LANGUAGES : ['de']
export const DEFAULT_LANGUAGE = config.DEFAULT_LANGUAGE || LANGUAGES[0]

// marker for entries that were built from values without language (they are found in every language)
export const ANY_LANGUAGE = '*'

// languages MongoDB text search supports (ISO 639-1), everything else is indexed without stemming
const TEXT_SEARCH_LANGUAGES = ['da', 'de', 'en', 'es', 'fi', 'fr', 'hu', 'it', 'nb', 'nl', 'pt', 'ro', 'ru', 'sv', 'tr']
export const textLanguage = (lang) => TEXT_SEARCH_LANGUAGES.includes(lang) ? lang : 'none'

/*
 Which fields are indexed. GenericData: from the type definition (fields with searchable: true,
 otherwise searchFields / pickerField; the title from pickerField). Core types: configured here.
 Can be extended or replaced per installation in the KeyValueGlobal "SearchIndexSettings",
 e.g. {"coreTypes": {"Media": {"title": ["name"], "fields": ["name", "imageText"]}}}
 */
export const DEFAULT_SETTINGS = {
    coreTypes: {
        CmsPage: {
            title: ['name'],
            fields: ['name', 'keyword', 'description', 'slug'],
            // pages with public: true can be found by everybody
            publicField: 'public'
        },
        Media: {
            title: ['name'],
            fields: ['name', 'alt', 'imageText'],
            // additionally all fields with searchable: true in the type definition
            useSearchableFields: true
        }
    },
    // max. characters of the indexed text of one entry
    maxTextLength: 20000
}

export const getSettings = async (db) => {
    let custom = null
    try {
        custom = await Util.getKeyValueGlobal(db, null, 'SearchIndexSettings', true)
    } catch (e) {
        console.warn('search: SearchIndexSettings could not be read', e.message)
    }
    if (!custom || custom.constructor !== Object) {
        return DEFAULT_SETTINGS
    }
    return {
        ...DEFAULT_SETTINGS,
        ...custom,
        coreTypes: {...DEFAULT_SETTINGS.coreTypes, ...(custom.coreTypes || {})}
    }
}
