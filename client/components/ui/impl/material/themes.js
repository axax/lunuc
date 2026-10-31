import {alpha} from '@mui/material/styles'
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

/*
 * CSS variables of a theme for CmsPages in the admin context (see client/util/themeMode.mjs).
 * Keep the names stable - pages depend on them. Always use them with a fallback:
 *   var(--lunuc-surface, #fff)
 */
export const themeCssVars = (theme) => {
    const p = theme.palette, text = p.text.primary
    const radius = theme.shape && theme.shape.borderRadius
    const vars = {
        '--lunuc-bg': p.background.default,
        '--lunuc-surface': p.background.paper,
        '--lunuc-subtle': p.background.subtle || alpha(text, 0.05),
        '--lunuc-border': p.divider,
        '--lunuc-border-strong': alpha(text, 0.22),
        '--lunuc-text': text,
        '--lunuc-text-muted': p.text.secondary,
        '--lunuc-primary': p.primary.main,
        '--lunuc-primary-contrast': p.primary.contrastText,
        '--lunuc-primary-soft': alpha(p.primary.main, 0.14),
        '--lunuc-primary-hover': p.primary.dark || p.primary.main,
        '--lunuc-secondary': p.secondary.main,
        '--lunuc-secondary-contrast': p.secondary.contrastText,
        '--lunuc-font': theme.typography.fontFamily,
        '--lunuc-radius': (typeof radius === 'number' ? radius + 'px' : radius) || '8px',
        '--lunuc-color-scheme': p.mode === 'dark' ? 'dark' : 'light'
    }
    ;['success', 'warning', 'error', 'info'].forEach(k => {
        vars['--lunuc-' + k] = p[k].main
        vars['--lunuc-' + k + '-soft'] = alpha(p[k].main, 0.14)
    })
    return vars
}

export const getThemeCssVars = (name) => {
    const key = (THEMES.find(t => t.value === name) || THEMES.find(t => t.value === DEFAULT_THEME)).value
    if (!cache['vars_' + key]) {
        cache['vars_' + key] = themeCssVars(getTheme(key))
    }
    return cache['vars_' + key]
}
