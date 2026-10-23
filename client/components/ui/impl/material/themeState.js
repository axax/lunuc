import {DEFAULT_THEME, THEMES, isDarkTheme} from './themes'
import {setThemeMode} from 'client/util/themeMode.mjs'

/*
 * Holds the name of the active admin theme.
 * The value is cached in localStorage so the right theme is used immediately on page load.
 * Persisting per user (key value "UserTheme") is done outside of the ui module
 * (see UserProfileContainer and BaseLayout) to avoid dependencies on graphql here.
 */
export const THEME_KEY = 'UserTheme'
const LS_KEY = 'lunucAdminTheme'

const isValid = name => !!THEMES.find(t => t.value === name)

const readFromStorage = () => {
    try {
        if (typeof window !== 'undefined' && !_app_.ssr && !_app_.noStorage) {
            const name = window.localStorage.getItem(LS_KEY)
            if (isValid(name)) {
                return name
            }
        }
    } catch (e) {
    }
    return DEFAULT_THEME
}

let currentThemeName = readFromStorage()
if (typeof window !== 'undefined' && !_app_.ssr) {
    setThemeMode({name: currentThemeName, dark: isDarkTheme(currentThemeName)})
}
const listeners = new Set()

export const getThemeName = () => currentThemeName

export const setThemeName = (name) => {
    if (!isValid(name)) {
        name = DEFAULT_THEME
    }
    try {
        if (typeof window !== 'undefined' && !_app_.noStorage) {
            window.localStorage.setItem(LS_KEY, name)
        }
    } catch (e) {
    }
    if (name !== currentThemeName) {
        currentThemeName = name
        listeners.forEach(fn => fn())
    }
    setThemeMode({name, dark: isDarkTheme(name)})
}

export const subscribeThemeName = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
}
