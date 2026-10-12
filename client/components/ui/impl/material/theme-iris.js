import {buildTheme} from './themeBuilder'

// 🎨 Fresh & Cheerful Palette
export const irisColors = {
    // Vibrant violet-blue primary
    primary: '#6366f1',
    primaryDark: '#4f46e5',
    primaryLight: '#818cf8',
    primaryXLight: '#e0e7ff',
    primaryXXLight: '#c7d2fe',
    // text color on primaryXLight backgrounds (selected/hover states)
    primaryOnLight: '#4f46e5',
    primaryRgb: '99,102,241',

    // Fun accent - coral/pink
    secondary: '#f43f5e',
    secondaryDark: '#e11d48',
    secondaryLight: '#fb7185',
    secondaryXLight: '#ffe4e6',
    secondaryText: '#be123c',
    secondaryRgb: '244,63,94',

    // Mint green success
    success: '#10b981',
    successDark: '#059669',
    successLight: '#d1fae5',
    successBorder: '#6ee7b7',
    successText: '#065f46',

    // Error (alerts)
    errorBorder: '#fda4af',
    errorText: '#9f1239',

    // Sunny yellow warning
    warning: '#f59e0b',
    warningDark: '#d97706',
    warningLight: '#fef3c7',
    warningBorder: '#fcd34d',
    warningText: '#92400e',

    // Sky blue info
    info: '#0ea5e9',
    infoDark: '#0284c7',
    infoLight: '#e0f2fe',
    infoBorder: '#7dd3fc',
    infoText: '#075985',

    // Backgrounds - bright & airy
    bgDefault: '#fcfcfd',
    bgPaper: '#ffffff',
    bgSubtle: '#f1f5fe',
    bgDrawer: '#f8faff',
    bgInput: '#ffffff',

    // Neutrals - cool, not cold
    grey50: '#f8faff',
    grey100: '#f1f5f9',
    grey200: '#e2e8f0',
    grey300: '#cbd5e1',
    grey400: '#94a3b8',
    grey500: '#64748b',
    grey700: '#334155',
    grey900: '#0f172a',

    textPrimary: '#1e293b',
    textSecondary: '#64748b',
    tooltipText: '#f8faff'
}

// 🌙 Dark variant of iris
export const irisDarkColors = {
    ...irisColors,
    primary: '#818cf8',
    primaryDark: '#6366f1',
    primaryLight: '#a5b4fc',
    primaryXLight: 'rgba(129,140,248,0.16)',
    primaryXXLight: 'rgba(129,140,248,0.28)',
    primaryOnLight: '#c7d2fe',
    primaryRgb: '129,140,248',

    secondaryXLight: 'rgba(244,63,94,0.16)',
    secondaryText: '#fda4af',

    successLight: 'rgba(16,185,129,0.16)',
    successBorder: 'rgba(16,185,129,0.4)',
    successText: '#6ee7b7',

    errorBorder: 'rgba(244,63,94,0.4)',
    errorText: '#fda4af',

    warningLight: 'rgba(245,158,11,0.16)',
    warningBorder: 'rgba(245,158,11,0.4)',
    warningText: '#fcd34d',

    infoLight: 'rgba(14,165,233,0.16)',
    infoBorder: 'rgba(14,165,233,0.4)',
    infoText: '#7dd3fc',

    bgDefault: '#0f1422',
    bgPaper: '#171d2e',
    bgSubtle: '#1f2740',
    bgDrawer: '#131a2a',
    bgInput: '#121827',

    grey50: '#1a2133',
    grey100: '#1f2637',
    grey200: '#2a3247',
    grey300: '#3b4560',
    grey400: '#64748b',
    grey500: '#94a3b8',
    grey700: '#cbd5e1',
    grey900: '#e2e8f0',

    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    tooltipText: '#0f172a'
}

export const defaultTheme = buildTheme(irisColors, 'light')

export default defaultTheme
