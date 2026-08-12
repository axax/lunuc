import {buildBaseElements} from './baseElements.mjs'
import {buildAdvancedElements} from './advancedElements.mjs'
import {MEDIA_PROJECTION, SLIDES_TAB} from './optionHelpers.mjs'
import {_t} from '../../../../util/i18n.mjs'

/**
 * The element definitions contain translated labels (_t) and depend on
 * _app_.languages. Building them at module level froze both to the language
 * that happened to be active on import, so a language switch without a page
 * reload kept showing the old labels. They are now built lazily per language
 * and cached.
 */
const cacheByLang = new Map()

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
        const base = buildBaseElements()
        const advanced = buildAdvancedElements()
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
