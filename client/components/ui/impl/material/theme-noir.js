import {irisColors} from './theme-iris'

// 🖤 Noir – monochrome, elegant, high contrast (zinc neutrals, ink-black primary, emerald accent)
export const noirColors = {
    ...irisColors,

    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontImport: "url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap')",

    // ink-black primary
    primary: '#18181b',
    primaryDark: '#09090b',
    primaryLight: '#3f3f46',
    primaryXLight: '#f4f4f5',
    primaryXXLight: '#e4e4e7',
    primaryOnLight: '#18181b',
    primaryRgb: '24,24,27',

    // refined emerald accent
    secondary: '#059669',
    secondaryDark: '#047857',
    secondaryLight: '#34d399',
    secondaryXLight: '#ecfdf5',
    secondaryText: '#065f46',
    secondaryRgb: '5,150,105',

    success: '#16a34a',
    successDark: '#15803d',
    successLight: '#f0fdf4',
    successBorder: '#bbf7d0',
    successText: '#166534',

    errorBorder: '#fecaca',
    errorText: '#991b1b',

    warning: '#d97706',
    warningDark: '#b45309',
    warningLight: '#fffbeb',
    warningBorder: '#fde68a',
    warningText: '#92400e',

    info: '#2563eb',
    infoDark: '#1d4ed8',
    infoLight: '#eff6ff',
    infoBorder: '#bfdbfe',
    infoText: '#1e40af',

    // warm off-white backgrounds
    bgDefault: '#fafafa',
    bgPaper: '#ffffff',
    bgSubtle: '#f4f4f5',
    bgDrawer: '#fafafa',
    bgInput: '#ffffff',

    // zinc neutrals
    grey50: '#fafafa',
    grey100: '#f4f4f5',
    grey200: '#e4e4e7',
    grey300: '#d4d4d8',
    grey400: '#a1a1aa',
    grey500: '#71717a',
    grey700: '#3f3f46',
    grey900: '#18181b',

    textPrimary: '#09090b',
    textSecondary: '#71717a',
    tooltipText: '#fafafa'
}
