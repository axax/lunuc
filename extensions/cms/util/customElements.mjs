/**
 * Custom elements of the element palette (KeyValueGlobal CmsCustomElements).
 *
 * An entry can be limited to user groups:
 *   {"name": "...", "ownerGroup": [{"_id": "...", "name": "Thal"}], "defaults": {...}}
 * Without ownerGroup (or empty) the element is available for everybody. Users with the capability
 * manage_cms_template see all elements (to maintain them).
 *
 * An entry can be created from a cms page (component): the "fields" of its manual become the options
 * of the element and the Cms child renders the page.
 */
import {setPropertyByPath} from '../../../client/util/json.mjs'
import Util from '../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants/index.mjs'

// the manual is either pure JSON ({description, fields}) or markdown containing a ```json block with fields
export const parseManualFields = (manual) => {
    if (!manual || !manual.trim()) {
        return null
    }
    const candidates = [manual.trim()]
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g
    let match
    while ((match = codeBlockRegex.exec(manual)) !== null) {
        candidates.push(match[1].trim())
    }
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate)
            if (parsed && parsed.fields && parsed.fields.constructor === Object) {
                return parsed.fields
            }
        } catch (e) {
            // not json, try next candidate
        }
    }
    return null
}

const getGroupIds = groups => [].concat(groups || [])
    .map(g => (g && typeof g === 'object') ? g._id : g)
    .filter(Boolean)
    .map(String)

const canManageCustomElements = (user = (typeof _app_ !== 'undefined' ? _app_.user : null)) =>
    !!user && Util.hasCapability(user, CAPABILITY_MANAGE_CMS_TEMPLATE)

/**
 * is the custom element available for the user (no groups, or one of the groups of the user)
 */
export const isCustomElementVisible = (element, user = (typeof _app_ !== 'undefined' ? _app_.user : null)) => {
    const groups = getGroupIds(element && element.ownerGroup)
    if (groups.length === 0 || canManageCustomElements(user)) {
        return true
    }
    const userGroups = getGroupIds(user && user.group)
    return groups.some(g => userGroups.indexOf(g) >= 0)
}

const localized = (value) => {
    if (!value) return ''
    if (typeof value === 'string') return value
    const lang = typeof _app_ !== 'undefined' ? _app_.lang : 'de'
    return value[lang] || Object.values(value).find(v => typeof v === 'string' && v) || ''
}

/**
 * builds a custom element for a cms page {slug, name, manual}
 * - the fields of the manual (keys relative to the Cms element, e.g. p_props_$_title) become the options
 *   of the element (prefixed with c_0_ for the Cms child)
 * - default values of the fields (defaultValue / value) are written to the Cms child
 */
export const createCustomElementFromCmsPage = (page, base = {}) => {
    const fields = parseManualFields(page.manual) || {}
    const cms = {
        t: 'Cms',
        // the element is edited via its options: the component must neither get its own editor frame
        // ($inlineEditor) nor render in edit mode (no forceEditMode), otherwise its elements catch the mouse
        // and the element can not be highlighted / edited in the editor
        $inlineEditor: false,
        p: {
            id: '__uid__',
            slug: page.slug,
            props: {$: {}}
        }
    }
    const options = {}
    Object.keys(fields).forEach(key => {
        const field = fields[key]
        options['c_0_' + key] = field
        if (key.indexOf('@') < 0 && /^p_/.test(key)) {
            const value = field.defaultValue !== undefined ? field.defaultValue : field.value
            if (value !== undefined) {
                setPropertyByPath(value, key, cms, '_')
            }
        }
    })
    return {
        tagName: 'div',
        icon: base.icon || 'extension',
        ...base,
        name: base.name || localized(page.name) || page.slug,
        fromCmsPage: page.slug,
        defaults: {
            c: [cms],
            $inlineEditor: {
                elementKey: 'customElement',
                allowDrag: true,
                allowDrop: false,
                options
            },
            p: {'data-element-key': 'customElement'}
        }
    }
}
