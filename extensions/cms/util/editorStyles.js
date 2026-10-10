/**
 * Styles of other CMS pages for the CmsEditor field of a GenericForm, so the content looks as on the page.
 *
 * Configured on the field of the type definition:
 *   {"uitype": "CmsEditor", "editorStyleSlugs": ["digithal/element/layout"], "editorClassName": "page", "editorStyle": "..."}
 *
 * The style of each page is loaded (with the resolved data of its data resolver, so ${scope.data...} works),
 * flattened and scoped to the editor canvas: every selector gets the scope class as ancestor and
 * html / body / :root are replaced by it, so the styles never leak into the admin.
 */
import Util from '../../../client/util/index.mjs'
import {client} from '../../../client/middleware/graphql'
import {preprocessCss} from './cssPreprocessor.mjs'

const STYLE_QUERY = 'query cmsPage($slug:String!,$inEditor:Boolean){cmsPage(slug:$slug,inEditor:$inEditor){slug style resolvedData}}'
const cache = {}

// evaluates ${...} in a page style like JsonDom.parseStyle does
const evaluateStyle = (style, data) => {
    if (!style || style.indexOf('${') < 0) {
        return style || ''
    }
    const styles = {}
    try {
        return new Function('const {scope,Util}=this;return `' + style + '`').call({
            scope: {data, inEditor: true, editMode: true, props: {}, params: {}, PageOptions: {}},
            Util,
            set: (key, value) => {
                styles[key] = value
                return ''
            },
            get: key => styles[key]
        })
    } catch (e) {
        console.warn('editorStyles: style could not be evaluated', e)
        return ''
    }
}

const splitSelectors = sel => {
    const parts = []
    let depth = 0, cur = ''
    for (const ch of sel) {
        if (ch === '(' || ch === '[') depth++
        if (ch === ')' || ch === ']') depth--
        if (ch === ',' && depth === 0) {
            parts.push(cur)
            cur = ''
        } else {
            cur += ch
        }
    }
    parts.push(cur)
    return parts.map(s => s.trim()).filter(s => s)
}

const scopeSelector = (sel, scope) => splitSelectors(sel).map(s => {
    const m = s.match(/^((?:html|body|:root)\b\s*)+/)
    if (m) {
        const rest = s.substring(m[0].length).trim()
        return rest ? (/^[.#\[:]/.test(rest) && !/\s/.test(m[0].slice(-1)) ? scope + rest : scope + ' ' + rest) : scope
    }
    return scope + ' ' + s
}).join(',')

// index of the closing brace that matches the opening brace at pos
const matchingBrace = (css, pos) => {
    let depth = 0
    for (let i = pos; i < css.length; i++) {
        if (css[i] === '{') depth++
        else if (css[i] === '}') {
            depth--
            if (depth === 0) return i
        }
    }
    return css.length - 1
}

/**
 * scopes flat css (output of preprocessCss), returns {imports, css}
 */
export const scopeCss = (flatCss, scope) => {
    const imports = [], out = []
    const walk = css => {
        const res = []
        let i = 0
        while (i < css.length) {
            while (i < css.length && /[\s;]/.test(css[i])) i++
            if (i >= css.length) break
            if (css.startsWith('@import', i) || css.startsWith('@charset', i)) {
                const end = css.indexOf(';', i)
                const stmt = css.substring(i, end < 0 ? css.length : end + 1)
                if (stmt.startsWith('@import')) imports.push(stmt)
                i = end < 0 ? css.length : end + 1
                continue
            }
            const open = css.indexOf('{', i)
            if (open < 0) break
            const selector = css.substring(i, open).trim()
            const close = matchingBrace(css, open)
            const body = css.substring(open + 1, close)
            if (selector.startsWith('@media') || selector.startsWith('@supports')) {
                const inner = walk(body)
                if (inner) res.push(selector + '{' + inner + '}')
            } else if (selector.startsWith('@')) {
                // @font-face, @keyframes ... unchanged
                res.push(selector + '{' + body + '}')
            } else if (selector) {
                res.push(scopeSelector(selector, scope) + '{' + body + '}')
            }
            i = close + 1
        }
        return res.join('\n')
    }
    out.push(walk(flatCss))
    return {imports, css: out.join('\n')}
}

const loadPageStyle = slug => {
    if (!cache[slug]) {
        cache[slug] = client.query({
            fetchPolicy: 'network-only',
            query: STYLE_QUERY,
            variables: {slug, inEditor: true}
        }).then(response => {
            const page = response.data && response.data.cmsPage
            if (!page) return ''
            let data = {}
            try {
                data = page.resolvedData ? JSON.parse(page.resolvedData) : {}
            } catch (e) {
                data = {}
            }
            return evaluateStyle(page.style, data)
        }).catch(error => {
            console.warn('editorStyles: style of ' + slug + ' could not be loaded', error)
            delete cache[slug]
            return ''
        })
    }
    return cache[slug]
}

/**
 * loads the styles of the given pages scoped to the selector, the result can be added to the style of a
 * CmsViewContainer (it is escaped for the template literal JsonDom uses to parse styles)
 */
export const loadEditorStyles = ({slugs, extraStyle, scope}) => {
    const list = [].concat(slugs || []).filter(s => s && typeof s === 'string')
    return Promise.all(list.map(loadPageStyle)).then(styles => {
        let all = styles.join('\n\n')
        if (extraStyle) {
            all += '\n\n' + extraStyle
        }
        const {imports, css} = scopeCss(preprocessCss(all), scope)
        const escape = s => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
        return {imports: escape(imports.join('\n')), css: escape(css)}
    })
}
