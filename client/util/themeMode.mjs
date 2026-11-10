/*
 * Admin theme for CmsPages - only in the admin context.
 *
 * A CmsPage must always work on its own. The admin theme is only exposed while the
 * page runs in the admin context:
 *   - the admin UI (UIProvider, see ui/impl/material) is mounted in this window, or
 *   - the page runs in an iframe whose (same origin) parent is in the admin context
 *
 * In the admin context:
 *   <html data-lunuc-admin data-theme="dark|light">
 *   CSS variables --lunuc-* on html[data-lunuc-admin] (see themeCssVars in ui/impl/material/themes.js)
 *   _app_.theme = {name, dark, vars}   (outside: {name: null, dark: false, vars: {}})
 *   window event "lunucthemechange"   -> scripts that render colors themselves
 *
 * Outside of it none of this is set, so pages use their own styles. Usage in a page:
 *   .my-page{ background: var(--lunuc-surface, #fff); color: var(--lunuc-text, #222); }
 *   html[data-theme="dark"] .my-page{ ... }   (only for things the variables don't cover)
 */
const ATTR_ADMIN = 'data-lunuc-admin'
const ATTR_THEME = 'data-theme'
const STYLE_ID = 'lunuc-theme-vars'

let current = {name: null, dark: false, vars: {}}
let adminCount = 0
let inAdminIframe = false

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined' && !_app_.ssr

export const isAdminContext = () => adminCount > 0 || inAdminIframe

const varsToCss = (vars) => Object.keys(vars || {}).map(k => `${k}:${vars[k]};`).join('')

const render = () => {
    if (!isBrowser()) return
    const html = document.documentElement
    let style = document.getElementById(STYLE_ID)
    if (isAdminContext()) {
        html.setAttribute(ATTR_ADMIN, '')
        html.setAttribute(ATTR_THEME, current.dark ? 'dark' : 'light')
        if (!style) {
            style = document.createElement('style')
            style.id = STYLE_ID
            document.head.appendChild(style)
        }
        style.textContent = `html[${ATTR_ADMIN}]{${varsToCss(current.vars)}}`
        _app_.theme = {...current}
    } else {
        html.removeAttribute(ATTR_ADMIN)
        html.removeAttribute(ATTR_THEME)
        if (style) style.remove()
        // no admin theme: consumers reading _app_.theme.dark keep working
        _app_.theme = {name: null, dark: false, vars: {}}
    }
}

const notify = () => {
    if (isBrowser()) {
        window.dispatchEvent(new CustomEvent('lunucthemechange', {detail: isAdminContext() ? {...current} : null}))
    }
}

/* called by the admin (ui/impl/material/themeState) whenever the theme changes */
export const setThemeMode = ({name, dark, vars}) => {
    const changed = current.name !== name || current.dark !== !!dark || varsToCss(current.vars) !== varsToCss(vars)
    current = {name: name || null, dark: !!dark, vars: vars || {}}
    if (changed) {
        render()
        if (isAdminContext()) notify()
    }
}

/* the admin UI mounts / unmounts (UIProvider) */
export const enterAdminContext = () => {
    adminCount++
    if (adminCount === 1 && !inAdminIframe) {
        render()
        notify()
    }
}

export const leaveAdminContext = () => {
    adminCount = Math.max(0, adminCount - 1)
    if (adminCount === 0 && !inAdminIframe) {
        render()
        notify()
    }
}

const parentAdminWindow = () => {
    try {
        if (window.parent && window.parent !== window &&
            window.parent.document.documentElement.hasAttribute(ATTR_ADMIN)) {
            return window.parent
        }
    } catch (e) {
        // cross origin -> not admin context
    }
    return null
}

let initialized = false
/* called once on startup (client/index.js, which loads this module only in an iframe of an admin window):
   takes over the theme of an admin parent window */
export const initThemeMode = () => {
    if (initialized || !isBrowser()) return
    initialized = true
    const parent = parentAdminWindow()
    if (!parent) return
    const take = () => {
        const t = parent._app_ && parent._app_.theme
        inAdminIframe = !!t
        if (t) {
            current = {name: t.name || null, dark: !!t.dark, vars: t.vars || {}}
        }
        render()
        notify()
    }
    take()
    parent.addEventListener('lunucthemechange', take)
    window.addEventListener('unload', () => parent.removeEventListener('lunucthemechange', take))
}
