import {buildTheme} from './themeBuilder'
import {irisColors, irisDarkColors, defaultTheme as irisTheme} from './theme-iris'
import {defaultTheme as classicTheme} from './theme'
import {noirColors} from './theme-noir'

export const DEFAULT_THEME = 'iris'

/*
 * Available admin themes. To add a new theme, define a color palette (see theme-iris.js)
 * and add an entry with create: () => buildTheme(myColors, 'light'|'dark').
 * dark: true tells CmsPages (via _app_.theme / html[data-theme], see util/themeMode.mjs)
 * that a dark theme is active.
 */
export const THEMES = [
    {value: 'iris', name: 'Iris', create: () => irisTheme},
    {value: 'irisDark', name: 'Iris Dark', dark: true, create: () => buildTheme(irisDarkColors, 'dark')},
    {value: 'noir', name: 'Noir', create: () => buildTheme(noirColors, 'light')},
    {value: 'classic', name: 'Classic', create: () => classicTheme}
]

export const isDarkTheme = (name) => !!THEMES.find(t => t.value === name)?.dark

const cache = {}

export const getTheme = (name) => {
    let entry = THEMES.find(t => t.value === name)
    if (!entry) {
        entry = THEMES.find(t => t.value === DEFAULT_THEME)
    }
    if (!cache[entry.value]) {
        cache[entry.value] = entry.create()
    }
    return cache[entry.value]
}
