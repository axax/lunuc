/*
 * Light/dark mode of the active admin theme for everything outside the MUI admin
 * (CmsPages, pages in iframes):
 *   _app_.theme = {name, dark}
 *   <html data-theme="dark|light">       -> CSS: html[data-theme="dark"] .my-page {...}
 *   window event "lunucthemechange"       -> scripts that render colors themselves
 *
 * The admin (ui/impl/material/themeState) calls setThemeMode whenever the theme
 * changes. The mode is cached in localStorage, so pages without the admin bundle,
 * other tabs and iframes pick it up (storage event) as well.
 */
const LS_NAME = 'lunucAdminTheme'
const LS_DARK = 'lunucAdminThemeDark'

export const applyThemeMode = ({name, dark}) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const prev = _app_.theme
    _app_.theme = {name: name || null, dark: !!dark}
    // only an attribute: pages that do not know it keep looking exactly as before
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    if (!prev || prev.dark !== _app_.theme.dark || prev.name !== _app_.theme.name) {
        window.dispatchEvent(new CustomEvent('lunucthemechange', {detail: _app_.theme}))
    }
}

export const setThemeMode = ({name, dark}) => {
    try {
        if (!_app_.noStorage) {
            window.localStorage.setItem(LS_DARK, dark ? '1' : '0')
        }
    } catch (e) {
    }
    applyThemeMode({name, dark})
}

const readThemeMode = () => {
    try {
        return {name: window.localStorage.getItem(LS_NAME), dark: window.localStorage.getItem(LS_DARK) === '1'}
    } catch (e) {
        return {name: null, dark: false}
    }
}

let initialized = false
export const initThemeMode = () => {
    if (initialized || typeof window === 'undefined' || _app_.ssr) return
    initialized = true
    if (!_app_.theme) {
        applyThemeMode(readThemeMode())
    }
    // theme switched in another tab, or in the page around this iframe
    window.addEventListener('storage', (e) => {
        if (e.key === LS_DARK || e.key === LS_NAME) {
            applyThemeMode(readThemeMode())
        }
    })
}
