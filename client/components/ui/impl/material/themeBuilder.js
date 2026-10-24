import {createTheme} from '@mui/material'

/*
 * Builds the lunuc admin theme (formerly theme-iris) from a color palette.
 * All palette keys used here are defined in theme-iris.js (irisColors / irisDarkColors).
 */
export const buildTheme = (colors, mode = 'light') => createTheme({
    palette: {
        mode,
        primary: {
            main: colors.primary,
            dark: colors.primaryDark,
            light: colors.primaryLight,
            contrastText: '#ffffff',
        },
        secondary: {
            main: colors.secondary,
            light: colors.secondaryLight,
            contrastText: '#ffffff',
        },
        success: {
            main: colors.success,
            light: colors.successLight,
            contrastText: '#ffffff',
        },
        warning: {
            main: colors.warning,
            light: colors.warningLight,
        },
        info: {
            main: colors.info,
            light: colors.infoLight,
        },
        background: {
            default: colors.bgDefault,
            paper: colors.bgPaper,
            // custom: used e.g. for hover states (SimpleTable)
            subtle: colors.bgSubtle,
        },
        text: {
            primary: colors.textPrimary,
            secondary: colors.textSecondary,
        },
        divider: colors.grey200,
    },

    // lunuc specific theme values
    lunuc: {
        // accent color for titles / icons in the header (AppBar has a light background here)
        headerAccentColor: colors.primary
    },

    typography: {
        // optional per palette: colors.fontFamily / colors.fontImport
        fontFamily: colors.fontFamily || '"Plus Jakarta Sans", "Inter", -apple-system, sans-serif',
        fontSize: 14,
        fontWeightLight: 300,
        fontWeightRegular: 400,
        fontWeightMedium: 600,
        fontWeightBold: 700,
        h1: { fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.03em', color: colors.textPrimary },
        h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' },
        h3: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' },
        h4: { fontSize: '1.25rem', fontWeight: 700 },
        h5: { fontSize: '1.0625rem', fontWeight: 600 },
        h6: { fontSize: '0.9375rem', fontWeight: 600 },
        body1: { fontSize: '0.9375rem', lineHeight: 1.7 },
        body2: { fontSize: '0.875rem', lineHeight: 1.65 },
        caption: { fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.02em' },
        button: {
            fontSize: '0.875rem',
            fontWeight: 600,
            textTransform: 'none',
            letterSpacing: '0.01em',
        },
        overline: {
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
        },
    },

    shape: {
        borderRadius: 12,
    },

    shadows: [
        'none',
        `0 1px 3px rgba(${colors.primaryRgb},0.06), 0 1px 2px rgba(0,0,0,0.04)`,
        `0 3px 8px rgba(${colors.primaryRgb},0.08), 0 2px 4px rgba(0,0,0,0.04)`,
        `0 6px 16px rgba(${colors.primaryRgb},0.10), 0 3px 6px rgba(0,0,0,0.04)`,
        `0 10px 24px rgba(${colors.primaryRgb},0.12), 0 4px 8px rgba(0,0,0,0.04)`,
        `0 14px 32px rgba(${colors.primaryRgb},0.14), 0 6px 12px rgba(0,0,0,0.05)`,
        `0 18px 40px rgba(${colors.primaryRgb},0.15), 0 8px 16px rgba(0,0,0,0.05)`,
        `0 22px 48px rgba(${colors.primaryRgb},0.16), 0 10px 20px rgba(0,0,0,0.06)`,
        `0 26px 56px rgba(${colors.primaryRgb},0.17), 0 12px 24px rgba(0,0,0,0.06)`,
        `0 30px 64px rgba(${colors.primaryRgb},0.18), 0 14px 28px rgba(0,0,0,0.07)`,
        `0 34px 72px rgba(${colors.primaryRgb},0.19), 0 16px 32px rgba(0,0,0,0.07)`,
        `0 38px 80px rgba(${colors.primaryRgb},0.20), 0 18px 36px rgba(0,0,0,0.08)`,
        `0 40px 84px rgba(${colors.primaryRgb},0.20), 0 20px 40px rgba(0,0,0,0.08)`,
        `0 44px 92px rgba(${colors.primaryRgb},0.21), 0 22px 44px rgba(0,0,0,0.09)`,
        `0 48px 100px rgba(${colors.primaryRgb},0.22), 0 24px 48px rgba(0,0,0,0.09)`,
        `0 52px 108px rgba(${colors.primaryRgb},0.22), 0 26px 52px rgba(0,0,0,0.10)`,
        `0 56px 116px rgba(${colors.primaryRgb},0.23), 0 28px 56px rgba(0,0,0,0.10)`,
        `0 60px 124px rgba(${colors.primaryRgb},0.23), 0 30px 60px rgba(0,0,0,0.11)`,
        `0 64px 132px rgba(${colors.primaryRgb},0.24), 0 32px 64px rgba(0,0,0,0.11)`,
        `0 68px 140px rgba(${colors.primaryRgb},0.24), 0 34px 68px rgba(0,0,0,0.12)`,
        `0 72px 148px rgba(${colors.primaryRgb},0.25), 0 36px 72px rgba(0,0,0,0.12)`,
        `0 76px 156px rgba(${colors.primaryRgb},0.25), 0 38px 76px rgba(0,0,0,0.13)`,
        `0 80px 164px rgba(${colors.primaryRgb},0.26), 0 40px 80px rgba(0,0,0,0.13)`,
        `0 84px 172px rgba(${colors.primaryRgb},0.26), 0 42px 84px rgba(0,0,0,0.14)`,
        `0 88px 180px rgba(${colors.primaryRgb},0.27), 0 44px 88px rgba(0,0,0,0.14)`,
    ],

    components: {
        // ── Baseline ───────────────────────────────────────────────
        MuiCssBaseline: {
            styleOverrides: {
                '@import': colors.fontImport || "url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap')",
                body: {
                    fontSize: '0.9375rem',
                    backgroundColor: colors.bgDefault,
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale',
                },
                '::selection': {
                    backgroundColor: colors.primaryXLight,
                    color: colors.primaryOnLight,
                },
                '::-webkit-scrollbar': { width: '6px', height: '6px' },
                '::-webkit-scrollbar-track': { background: 'transparent' },
                '::-webkit-scrollbar-thumb': {
                    background: colors.grey300,
                    borderRadius: '99px',
                    '&:hover': { background: colors.grey400 },
                },
            },
        },

        // ── AppBar ──────────────────────────────────────────────
        MuiAppBar: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: {
                    background: colors.bgPaper,
                    /*backdropFilter: 'blur(12px)',*/
                    WebkitBackdropFilter: 'blur(12px)',
                    borderBottom: `1px solid ${colors.grey200}`,
                    borderLeft:0,
                    borderRadius: 0,
                    color: colors.textPrimary,
                },
            },
        },

        // ── Drawer ──────────────────────────────────────────────
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    background: `linear-gradient(180deg, ${colors.bgPaper} 0%, ${colors.bgDrawer} 100%)`,
                    borderRight: `1px solid ${colors.grey200}`,
                    borderRadius: 0,
                    scrollbarWidth: 'none',
                    '&::-webkit-scrollbar': { display: 'none' },
                },
            },
        },

        // ── Paper ────────────────────────────────────────────────
        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: {
                    backgroundColor: colors.bgPaper,
                    borderRadius: 16,
                    border: `1px solid ${colors.grey200}`,
                    backgroundImage: 'none',
                },
                elevation1: {
                    boxShadow: `0 2px 8px rgba(${colors.primaryRgb},0.08), 0 1px 3px rgba(0,0,0,0.04)`,
                    border: 'none',
                },
                elevation2: {
                    boxShadow: `0 6px 20px rgba(${colors.primaryRgb},0.12), 0 2px 6px rgba(0,0,0,0.04)`,
                    border: 'none',
                },
                elevation3: {
                    boxShadow: `0 12px 32px rgba(${colors.primaryRgb},0.16), 0 4px 10px rgba(0,0,0,0.06)`,
                    border: 'none',
                },
            },
        },

        // ── Card ─────────────────────────────────────────────────
        MuiCard: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: {
                    borderRadius: 16,
                    border: `1px solid ${colors.grey200}`,
                    backgroundColor: colors.bgPaper,
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: `0 12px 32px rgba(${colors.primaryRgb},0.16)`,
                        borderColor: colors.primaryXLight,
                    },
                },
            },
        },

        // ── Buttons ─────────────────────────────────────────────
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: {
                    margin: '8px',
                    padding: '8px 20px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    textTransform: 'none',
                    transition: 'all 0.18s ease',
                    letterSpacing: '0.01em',
                },
                contained: {
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    boxShadow: `0 4px 12px rgba(${colors.primaryRgb},0.35)`,
                    '&:hover': {
                        background: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primary} 100%)`,
                        boxShadow: `0 6px 20px rgba(${colors.primaryRgb},0.45)`,
                        transform: 'translateY(-1px)',
                    },
                    '&:active': { transform: 'translateY(0px)' },
                    '&.Mui-disabled': {
                        background: colors.grey200,
                        color: colors.textSecondary,
                        boxShadow: 'none',
                        opacity: 0.85,
                    },
                },
                containedSecondary: {
                    background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.secondaryDark} 100%)`,
                    boxShadow: `0 4px 12px rgba(${colors.secondaryRgb},0.35)`,
                    '&:hover': {
                        boxShadow: `0 6px 20px rgba(${colors.secondaryRgb},0.45)`,
                        transform: 'translateY(-1px)',
                    },
                    '&.Mui-disabled': {
                        background: colors.grey200,
                        color: colors.textSecondary,
                        boxShadow: 'none',
                        opacity: 0.85,
                    },
                },
                outlined: {
                    borderWidth: '1.5px',
                    borderColor: colors.grey300,
                    color: colors.textPrimary,
                    '&:hover': {
                        borderWidth: '1.5px',
                        borderColor: colors.primary,
                        backgroundColor: colors.primaryXLight,
                        color: colors.primary,
                        transform: 'translateY(-1px)',
                    },
                },
                text: {
                    color: colors.textSecondary,
                    '&:hover': {
                        backgroundColor: colors.bgSubtle,
                        color: colors.primary,
                    },
                },
                sizeSmall: {
                    padding: '5px 14px',
                    fontSize: '0.8125rem',
                    borderRadius: 8,
                },
                sizeLarge: {
                    padding: '12px 28px',
                    fontSize: '1rem',
                    borderRadius: 14,
                },
            },
        },

        MuiIconButton: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        backgroundColor: colors.primaryXLight,
                        color: colors.primary,
                        transform: 'scale(1.05)',
                    },
                },
            },
        },

        MuiFab: {
            styleOverrides: {
                root: {
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
                    boxShadow: `0 8px 24px rgba(${colors.primaryRgb},0.45)`,
                    '&:hover': {
                        boxShadow: `0 12px 32px rgba(${colors.primaryRgb},0.55)`,
                        transform: 'translateY(-2px) scale(1.02)',
                    },
                },
            },
        },

        // ── Inputs ──────────────────────────────────────────────
        MuiTextField: {
            defaultProps: { variant: 'outlined' },
        },
        MuiNativeSelect: {
            defaultProps: { variant: 'outlined' },
        },
        MuiInputLabel: {
            defaultProps: { variant: 'outlined' },
            styleOverrides: {
                root: {
                    lineHeight: '1',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    color: colors.textSecondary,
                    '&.Mui-focused': { color: colors.primary },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    backgroundColor: colors.bgInput,
                    transition: 'box-shadow 0.18s ease',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: colors.grey200,
                        borderWidth: '1.5px',
                        transition: 'border-color 0.18s ease',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: colors.grey300,
                    },
                    '&.Mui-focused': {
                        boxShadow: `0 0 0 3px rgba(${colors.primaryRgb},0.15)`,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: colors.primary,
                            borderWidth: '2px',
                        },
                    },
                    '&.Mui-error .MuiOutlinedInput-notchedOutline': {
                        borderColor: colors.secondary,
                    },
                    '&.Mui-error.Mui-focused': {
                        boxShadow: `0 0 0 3px rgba(${colors.secondaryRgb},0.12)`,
                    },
                },
                input: {
                    fontSize: '0.9375rem',
                    padding: '11px 14px',
                },
            },
        },
        MuiInput: {
            styleOverrides: {
                root: {
                    margin: '8px',
                    '&:before': { borderColor: colors.grey300 },
                    '&:hover:not(.Mui-disabled):before': { borderColor: colors.primary },
                    '&:after': { borderColor: colors.primary },
                },
                formControl: { margin: 0 },
            },
        },
        MuiFormControl: {
            styleOverrides: {
                root: { margin: '8px', minWidth: '200px' },
                fullWidth: { margin: '8px', width: 'calc(100% - 16px)' },
            },
        },
        MuiFormHelperText: {
            styleOverrides: {
                root: { fontSize: '0.8rem', marginTop: 5, fontWeight: 500 },
            },
        },

        // ── Select / Autocomplete ────────────────────────────────
        MuiSelect: {
            defaultProps: { variant: 'outlined' },
            styleOverrides: {
                icon: { color: colors.grey400 },
            },
        },
        MuiAutocomplete: {
            styleOverrides: {
                root: {
                    '& .MuiTextField-root': {
                        width: '100%',
                    }
                },
                popper: { zIndex: '99999' },
                inputRoot: {
                    padding: '4px 9px',
                    '& .MuiAutocomplete-input': {
                        padding: '6px 6px 6px 0',
                        lineHeight: '1.5',
                    },
                },
                paper: {
                    border: `1px solid ${colors.grey200}`,
                    boxShadow: `0 12px 32px rgba(${colors.primaryRgb},0.16)`,
                    borderRadius: 12,
                    marginTop: 4,
                },
                option: {
                    fontSize: '0.9rem',
                    borderRadius: 8,
                    margin: '2px 6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: 40,
                    '&[aria-selected="true"]': {
                        backgroundColor: `${colors.primaryXLight} !important`,
                        color: colors.primaryOnLight,
                        fontWeight: 600,
                    },
                    '&.Mui-focused': {
                        backgroundColor: colors.bgSubtle,
                    },
                },
                listbox: { padding: '6px' },
                tag: { margin: '3px', height: '28px' },
            },
        },

        // ── Chip ─────────────────────────────────────────────────
        MuiChip: {
            styleOverrides: {
                root: {
                    margin: '0 8px 8px 8px',
                    borderRadius: 8,
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    height: 30,
                    backgroundColor: colors.bgSubtle,
                    color: colors.grey700,
                    border: `1px solid ${colors.grey200}`,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        backgroundColor: colors.primaryXLight,
                        borderColor: colors.primaryLight,
                        color: colors.primaryOnLight,
                    },
                    '&.MuiChip-colorPrimary': {
                        background: `linear-gradient(135deg, ${colors.primaryXLight}, ${colors.primaryXXLight})`,
                        color: colors.primaryOnLight,
                        borderColor: 'transparent',
                    },
                    '&.MuiChip-colorSecondary': {
                        background: colors.secondaryXLight,
                        color: colors.secondaryText,
                        borderColor: 'transparent',
                    },
                    '&.MuiChip-colorSuccess': {
                        background: colors.successLight,
                        color: colors.successText,
                        borderColor: 'transparent',
                    },
                },
                deleteIcon: {
                    color: 'inherit',
                    opacity: 0.5,
                    '&:hover': { opacity: 1 },
                },
            },
        },

        // ── Table ─────────────────────────────────────────────────
        MuiTableContainer: {
            styleOverrides: {
                root: { borderRadius: 16, border: `1px solid ${colors.grey200}` },
            },
        },
        MuiTableHead: {
            styleOverrides: {
                root: {
                    '& .MuiTableCell-head': {
                        color: colors.textSecondary,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        borderBottom: `2px solid ${colors.grey200}`,
                        padding: '14px 16px',
                    },
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    transition: 'background-color 0.12s ease',
                    '&:hover': {
                        backgroundColor: colors.bgSubtle,
                    },
                    '&:last-child td': { border: 0 },
                },
                footer: {
                    borderTop: `1px solid ${colors.grey200}`,
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    backgroundColor: colors.bgPaper,
                    borderBottom: `1px solid ${colors.grey100}`,
                    fontSize: '0.875rem',
                    padding: '13px 16px',
                    color: colors.textPrimary,
                    '& a, & a:visited': {
                        color: colors.primary,
                    },
                },
                head: {
                    borderBottom: `1px solid ${colors.grey200} !important`,
                },
            },
        },

        // ── List / Nav ────────────────────────────────────────────
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    margin: '1px 8px',
                    padding: '5px 12px',
                    color: colors.textSecondary,
                    fontWeight: 500,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                        backgroundColor: colors.bgSubtle,
                        color: colors.primary,
                        paddingLeft: 14,
                        '& .MuiListItemIcon-root': { color: colors.primary },
                    },
                    '&.Mui-selected': {
                        background: 'transparent',
                        color: colors.primary,
                        fontWeight: 700,
                        '& .MuiListItemText-primary': { fontWeight: 700 },
                        '& .MuiTypography-subtitle1': { fontWeight: 700 },
                        '& .MuiListItemIcon-root': { color: colors.primary },
                        '&:hover': {
                            background: colors.bgSubtle,
                        },
                    },
                },
            },
        },
        MuiListItemIcon: {
            styleOverrides: {
                root: { minWidth: 44, color: 'inherit', transition: 'color 0.15s ease' },
            },
        },
        MuiListItemText: {
            styleOverrides: {
                primary: { fontWeight: 'inherit', fontSize: '0.9rem' },
            },
        },

        // ── Tabs ─────────────────────────────────────────────────
        MuiTabs: {
            styleOverrides: {
                root: {
                    borderBottom: `1px solid ${colors.grey200}`,
                    minHeight: 46,
                },
                indicator: {
                    height: 3,
                    borderRadius: '3px 3px 0 0',
                    background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryLight})`,
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    color: colors.textSecondary,
                    minHeight: 46,
                    padding: '10px 20px',
                    transition: 'color 0.15s ease',
                    '&.Mui-selected': {
                        color: colors.primary,
                    },
                    '&:hover': {
                        color: colors.primary,
                        backgroundColor: colors.primaryXLight,
                        borderRadius: '8px 8px 0 0',
                    },
                },
            },
        },

        // ── Tooltip ───────────────────────────────────────────────
        MuiTooltip: {
            styleOverrides: {
                popper: { zIndex: '99999' },
                tooltip: {
                    background: colors.grey900,
                    color: colors.tooltipText,
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    borderRadius: 8,
                    padding: '6px 12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                },
                arrow: { color: colors.grey900 },
            },
        },

        // ── Dialog ────────────────────────────────────────────────
        MuiDialog: {
            styleOverrides: {
                root: { zIndex: '9999' },
                paper: {
                    borderRadius: 20,
                    boxShadow: `0 24px 64px rgba(${colors.primaryRgb},0.20), 0 8px 24px rgba(0,0,0,0.08)`,
                    border: `1px solid ${colors.grey200}`,
                    overflow: 'hidden',
                },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: {
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    padding: '22px 24px 16px',
                    /*borderBottom: `1px solid ${colors.grey100}`,*/
                },
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: { padding: '20px 24px' },
            },
        },
        MuiDialogActions: {
            styleOverrides: {
                root: {
                    padding: '12px 20px',
                    /*borderTop: `1px solid ${colors.grey100}`,*/
                    gap: 4,
                },
            },
        },

        // ── Snackbar / Alert ──────────────────────────────────────
        MuiSnackbar: {
            styleOverrides: { root: { zIndex: '10000 !important' } },
        },
        MuiAlert: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    alignItems: 'center',
                    border: '1px solid transparent',
                },
                standardSuccess: {
                    backgroundColor: colors.successLight,
                    borderColor: colors.successBorder,
                    color: colors.successText,
                },
                standardError: {
                    backgroundColor: colors.secondaryXLight,
                    borderColor: colors.errorBorder,
                    color: colors.errorText,
                },
                standardWarning: {
                    backgroundColor: colors.warningLight,
                    borderColor: colors.warningBorder,
                    color: colors.warningText,
                },
                standardInfo: {
                    backgroundColor: colors.infoLight,
                    borderColor: colors.infoBorder,
                    color: colors.infoText,
                },
                filledSuccess: { background: `linear-gradient(135deg, ${colors.success}, ${colors.successDark})` },
                filledError: { background: `linear-gradient(135deg, ${colors.secondary}, ${colors.secondaryDark})` },
                filledWarning: { background: `linear-gradient(135deg, ${colors.warning}, ${colors.warningDark})` },
                filledInfo: { background: `linear-gradient(135deg, ${colors.info}, ${colors.infoDark})` },
            },
        },

        // ── Popover ───────────────────────────────────────────────
        MuiPopover: {
            styleOverrides: {
                root: { zIndex: '9999' },
                paper: {
                    borderRadius: 14,
                    border: `1px solid ${colors.grey200}`,
                    boxShadow: `0 12px 36px rgba(${colors.primaryRgb},0.16)`,
                    marginTop: 4,
                },
            },
        },

        // ── Menu ──────────────────────────────────────────────────
        MuiMenu: {
            styleOverrides: {
                paper: {
                    borderRadius: 12,
                    border: `1px solid ${colors.grey200}`,
                    boxShadow: `0 12px 32px rgba(${colors.primaryRgb},0.14)`,
                    padding: '4px',
                },
                list: { padding: 4 },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    borderRadius: 8,
                    padding: '8px 12px',
                    margin: '1px 0',
                    color: colors.textPrimary,
                    transition: 'all 0.12s ease',
                    '&:hover': {
                        backgroundColor: colors.primaryXLight,
                        color: colors.primaryOnLight,
                    },
                    '&.Mui-selected': {
                        backgroundColor: colors.primaryXLight,
                        color: colors.primaryOnLight,
                        fontWeight: 700,
                        '&:hover': { backgroundColor: colors.primaryXXLight },
                    },
                },
            },
        },

        MuiListItem: {
            styleOverrides: {
                root: {
                    paddingTop: 1,
                    paddingBottom: 1,
                },
            },
        },
        MuiList: {
            styleOverrides: {
                root: {
                    paddingTop: 2,
                    paddingBottom: 2,
                },
            },
        },
        MuiDivider: {
            styleOverrides: {
                root: { borderColor: colors.grey200 },
            },
        },

        // ── Badge ─────────────────────────────────────────────────
        MuiBadge: {
            styleOverrides: {
                badge: {
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: `linear-gradient(135deg, ${colors.secondary}, ${colors.secondaryDark})`,
                    color: '#fff',
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    padding: '0 5px',
                    boxShadow: `0 2px 6px rgba(${colors.secondaryRgb},0.4)`,
                },
                colorPrimary: {
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
                    boxShadow: `0 2px 6px rgba(${colors.primaryRgb},0.4)`,
                },
            },
        },

        // ── Switch ────────────────────────────────────────────────
        MuiFormControlLabel: {
            styleOverrides: {
                root: {
                    margin:'8px',
                    gap: 6,
                },
            },
        },
        MuiSwitch: {
            styleOverrides: {
                root: {
                    width: 44,
                    height: 26,
                    padding: 0,
                    '& .MuiSwitch-switchBase': {
                        padding: 3,
                        '&.Mui-checked': {
                            transform: 'translateX(18px)',
                            color: '#fff',
                            '& + .MuiSwitch-track': {
                                background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryLight})`,
                                opacity: 1,
                                border: 0,
                            },
                        },
                    },
                    '& .MuiSwitch-thumb': {
                        width: 20,
                        height: 20,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    },
                    '& .MuiSwitch-track': {
                        borderRadius: 13,
                        backgroundColor: colors.grey300,
                        opacity: 1,
                    },
                },
            },
        },

        // ── Checkbox / Radio ──────────────────────────────────────
        MuiCheckbox: {
            styleOverrides: {
                root: {
                    color: colors.grey300,
                    '&.Mui-checked': { color: colors.primary },
                    '&:hover': { backgroundColor: colors.primaryXLight },
                    borderRadius: 6,
                },
            },
        },
        MuiRadio: {
            styleOverrides: {
                root: {
                    color: colors.grey300,
                    '&.Mui-checked': { color: colors.primary },
                    '&:hover': { backgroundColor: colors.primaryXLight },
                },
            },
        },

        // ── Progress ──────────────────────────────────────────────
        MuiLinearProgress: {
            styleOverrides: {
                root: {
                    borderRadius: 99,
                    height: 8,
                    backgroundColor: colors.bgSubtle,
                },
                bar: {
                    borderRadius: 99,
                    background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryLight})`,
                },
            },
        },
        MuiCircularProgress: {
            styleOverrides: {
                circle: { strokeLinecap: 'round' },
            },
        },

        // ── Breadcrumbs ───────────────────────────────────────────
        MuiBreadcrumbs: {
            styleOverrides: {
                root: { fontSize: '0.875rem', fontWeight: 500 },
                separator: { color: colors.grey300 },
                li: {
                    '& a': {
                        color: colors.primary,
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                    },
                },
            },
        },

        // ── Accordion ─────────────────────────────────────────────
        MuiAccordion: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: {
                    border: `1px solid ${colors.grey200}`,
                    borderRadius: '12px !important',
                    marginBottom: 8,
                    '&:before': { display: 'none' },
                    '&.Mui-expanded': {
                        boxShadow: 'none',
                        margin: '0 0 8px 0',
                    },
                    // Add className="accordion-flat" when inside a Drawer
                    '&.accordion-flat': {
                        border: 'none',
                        borderBottom: `1px solid ${colors.grey200}`,
                        borderRadius: '0 !important',
                        marginBottom: 0,
                        '&.Mui-expanded': {
                            margin: 0,
                        },
                    },
                },
            },
        },
        MuiAccordionSummary: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    '&.Mui-expanded': {
                        color: colors.primary,
                    },
                },
                expandIconWrapper: {
                    color: colors.grey400,
                    '&.Mui-expanded': { color: colors.primary },
                },
            },
        },

        // ── Skeleton ──────────────────────────────────────────────
        MuiSkeleton: {
            defaultProps: { animation: 'wave' },
            styleOverrides: {
                root: {
                    backgroundColor: colors.grey100,
                    borderRadius: 8,
                },
            },
        },

        // ── Pagination ────────────────────────────────────────────
        MuiPaginationItem: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    fontWeight: 600,
                    '&.Mui-selected': {
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryDark})`,
                        color: '#fff',
                        boxShadow: `0 4px 10px rgba(${colors.primaryRgb},0.4)`,
                    },
                },
            },
        },

        // ── Stepper ───────────────────────────────────────────────
        MuiStepLabel: {
            styleOverrides: {
                label: {
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    '&.Mui-active': { color: colors.primary },
                    '&.Mui-completed': { color: colors.success },
                },
            },
        },
        MuiStepIcon: {
            styleOverrides: {
                root: {
                    '&.Mui-active': { color: colors.primary },
                    '&.Mui-completed': { color: colors.success },
                },
            },
        },

        // ── Slider ────────────────────────────────────────────────
        MuiSlider: {
            styleOverrides: {
                root: { color: colors.primary },
                thumb: {
                    boxShadow: `0 0 0 4px rgba(${colors.primaryRgb},0.18)`,
                    '&:hover': { boxShadow: `0 0 0 6px rgba(${colors.primaryRgb},0.22)` },
                },
                track: {
                    background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryLight})`,
                    border: 'none',
                },
                rail: { backgroundColor: colors.grey200 },
            },
        },

        // ── Avatar ────────────────────────────────────────────────
        MuiAvatar: {
            styleOverrides: {
                root: {
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryLight})`,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                },
                colorDefault: {
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryLight})`,
                    color: '#ffffff',
                },
            },
        },
    },
})


export default buildTheme
