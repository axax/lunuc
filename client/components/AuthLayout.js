import React from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/material/styles'

const DEFAULT_LOGO = 'https://www.lunuc.com/lunuc-logo.svg'

const fadeIn = {
    animation: 'lunucLoginIn .4s cubic-bezier(.2,.8,.2,1) both',
    '@media (prefers-reduced-motion: reduce)': {animation: 'none'}
}

// Minimal, clean card: hairline border, soft shadow, generous whitespace
export const cardSx = (theme) => {
    const dark = theme.palette.mode === 'dark'
    return {
        mb: 2,
        borderRadius: '16px',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}`,
        background: dark ? '#16161a' : '#fff',
        boxShadow: dark
            ? '0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -12px rgba(0,0,0,0.6)'
            : '0 1px 2px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.12)',
        '& .MuiCardContent-root': {p: {xs: 3, sm: 5}},
        '& .MuiCardContent-root:last-child': {pb: {xs: 3, sm: 5}},
        '& h3': {
            fontSize: '1.5rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.3,
            mb: 3
        },
        '& h3 + p': {
            mt: -2.25,
            fontSize: '0.875rem',
            color: 'text.secondary',
            mb: 3
        },
        '& .MuiTextField-root': {margin: '0 0 16px', width: '100%'},
        '& .MuiOutlinedInput-root': {
            borderRadius: '10px',
            transition: 'box-shadow .15s ease',
            '&.Mui-focused': {boxShadow: `0 0 0 3px ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)'}`}
        },
        '& .MuiButton-root': {
            textTransform: 'none',
            borderRadius: '10px',
            fontWeight: 500,
            boxShadow: 'none',
            '&:hover': {boxShadow: 'none'}
        },
        '& .MuiButton-contained': {
            margin: '8px 0 0',
            py: 1.2,
            background: theme.palette.primary.main,
            '&:hover': {background: theme.palette.primary.dark, boxShadow: 'none'}
        },
        ...fadeIn
    }
}

export const AuthLayout = ({children}) => {
    const login = (typeof _app_ !== 'undefined' && _app_.login) || {}
    const isDark = useTheme().palette.mode === 'dark'
    return <Box sx={(theme) => ({
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 6,
        background: theme.palette.mode === 'dark' ? '#0e0e11' : '#f7f7f8',
        '@keyframes lunucLoginIn': {
            from: {opacity: 0, transform: 'translate3d(0,8px,0)'},
            to: {opacity: 1, transform: 'translate3d(0,0,0)'}
        }
    })}>
        <Box sx={(theme) => ({
            width: '100%',
            maxWidth: 400,
            // alternative logins (e.g. passkey) rendered below the card
            '& > .MuiButton-root': {
                textTransform: 'none',
                borderRadius: '10px',
                margin: 0,
                py: 1.2,
                fontWeight: 500,
                color: 'text.primary',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
                background: theme.palette.mode === 'dark' ? '#16161a' : '#fff',
                '&:hover': {
                    borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(15,23,42,0.24)',
                    background: theme.palette.mode === 'dark' ? '#1c1c21' : '#fafafa'
                }
            }
        })}>
            <Box component="img"
                 alt="Logo"
                 src={(isDark && login.logoDark) || login.logo || DEFAULT_LOGO}
                 sx={{
                     display: 'block',
                     mx: 'auto',
                     mb: 4,
                     height: 'auto',
                     maxHeight: '2.5rem',
                     maxWidth: '60%',
                     filter: isDark && !login.logoDark ? 'invert(1) hue-rotate(180deg)' : 'none',
                     ...fadeIn
                 }}/>
            {children}
        </Box>
    </Box>
}

export default AuthLayout
