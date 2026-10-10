import {buildBaseElements} from './baseElements.mjs'
import {buildAdvancedElements} from './advancedElements.mjs'
import {
    MEDIA_PROJECTION, SLIDES_TAB, DEFAULT_TAB, EXTENDED_TAB, MISC_TAB, RESPONSIVE_TAB, IMAGE_OPTIMIZATION_TAB,
    MARGIN_TAB, VISIBILITY_TAB, TRANSLATION_TAB, EVENT_TAB
} from './optionHelpers.mjs'
import {_t} from '../../../../util/i18n.mjs'

/**
 * The element definitions contain translated labels (_t) and depend on
 * _app_.languages. Building them at module level froze both to the language
 * that happened to be active on import, so a language switch without a page
 * reload kept showing the old labels. They are now built lazily per language
 * and cached.
 */
const cacheByLang = new Map()

// order of the tabs in the settings dialog; element specific tabs (video, slides ...) come after "Allgemein"
const TAB_RANK = {
    [DEFAULT_TAB]: 0, [MISC_TAB]: 2, [RESPONSIVE_TAB]: 3, [IMAGE_OPTIMIZATION_TAB]: 4, [MARGIN_TAB]: 5,
    [VISIBILITY_TAB]: 6, [TRANSLATION_TAB]: 7, [EXTENDED_TAB]: 8, [EVENT_TAB]: 9
}
const tabRank = field => TAB_RANK[field.tab] !== undefined ? TAB_RANK[field.tab] : 1

/**
 * Arranges the options for the settings dialog (keys and stored values are unchanged):
 * options without tab go to "Erweitert", the tabs get a fixed order (the dialog creates them in the order of
 * the first field) and the options listed in element.optionOrder come first in their tab.
 */
const arrangeElementOptions = element => {
    const options = element.options
    if (!options) {
        return element
    }
    const order = element.optionOrder || []
    const keys = Object.keys(options)
    keys.forEach(key => {
        const field = options[key]
        if (field && typeof field === 'object' && !field.tab && !field.invisible && !field.noTab) {
            options[key] = {...field, tab: EXTENDED_TAB}
        }
    })
    const pos = key => {
        const i = order.indexOf(key)
        return i < 0 ? order.length + keys.indexOf(key) : i
    }
    const arranged = {}
    keys.sort((a, b) => (tabRank(options[a]) - tabRank(options[b])) || (pos(a) - pos(b)))
        .forEach(key => {
            arranged[key] = options[key]
        })
    element.options = arranged
    return element
}

const indexByKey = elements => {
    const map = {}
    for (const element of elements) {
        // was assigned lazily before, so a caller fetching the plain list first
        // got elements without .value
        element.value = element.defaults.$inlineEditor.elementKey
        map[element.value] = element
    }
    return map
}

const getCache = () => {
    const lang = (typeof _app_ !== 'undefined' && _app_.lang) || 'default'
    let cache = cacheByLang.get(lang)
    if (!cache) {
        // options arranged for the settings dialog (tab order, technical options in "Erweitert", widths)
        const base = buildBaseElements().map(arrangeElementOptions)
        const advanced = buildAdvancedElements().map(arrangeElementOptions)
        cache = {
            base,
            advanced,
            all: [...base, ...advanced],
            baseMap: indexByKey(base),
            advancedMap: indexByKey(advanced)
        }
        cacheByLang.set(lang, cache)
    }
    return cache
}

/**
 * @param value    element key. 'customElement' returns an empty object,
 *                 undefined returns the full list
 * @param options  {advanced: true} to include the advanced elements
 */
const getJsonDomElements = (value, options) => {
    if (value === 'customElement') {
        return {}
    }
    const cache = getCache()
    if (value) {
        return cache.baseMap[value] || cache.advancedMap[value]
    }
    return options && options.advanced ? cache.all : cache.base
}

export const replaceUidPlaceholder = (comp) => {
    const uid = 'genid_' + Math.random().toString(36).slice(2, 11)
    return JSON.parse(JSON.stringify(comp).replace(/__uid__/g, uid))
}

// index per element list, so repeated lookups don't scan the array again
const listIndexCache = new WeakMap()

const getListIndex = elementList => {
    let index = listIndexCache.get(elementList)
    if (!index) {
        index = new Map()
        for (const comp of elementList) {
            index.set(comp.defaults.$inlineEditor.elementKey, comp)
        }
        listIndexCache.set(elementList, index)
    }
    return index
}

const expandGroupOptions = item => {
    if (!item.groupOptions) {
        return item
    }
    for (const key of Object.keys(item.groupOptions)) {
        const group = item.groupOptions[key]
        item.options[`!${key}!add`] = {
            uitype: 'button',
            group,
            key,
            newLine: true,
            label: _t('elements.add'),
            tab: SLIDES_TAB,
            tabPosition: 0,
            action: 'add',
            style: {marginBottom: '2rem'},
            ...group._addButton
        }
        for (const fieldKey of Object.keys(group)) {
            if (fieldKey !== '_addButton') {
                item.options[`!${key}!${fieldKey}!0`] = group[fieldKey]
            }
        }
    }
    return item
}

const createElementByKeyFromList = (key, elementList) => {
    const comp = getListIndex(elementList).get(key)
    if (!comp) {
        return undefined
    }
    // replace __uid__ placeholder (also deep clones, so the mutation below
    // never touches the shared definition)
    return expandGroupOptions(replaceUidPlaceholder(comp))
}

export {getJsonDomElements, createElementByKeyFromList, MEDIA_PROJECTION}
