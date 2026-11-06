import React from 'react'
import Box from '@mui/material/Box'
import {useTheme} from '@mui/material/styles'

const DEFAULT_LOGO = 'https://www.lunuc.com/lunuc-logo.svg'

// Only transform/opacity are animated (GPU friendly) and motion is disabled for users who prefer reduced motion.
const blobSx = (color, size, pos, delay) => ({
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: '50%',
    background: `radial-gradient(circle at 30% 30%, ${color}, transparent 70%)`,
    filter: 'blur(60px)',
    opacity: 0.55,
    willChange: 'transform',
    animation: `lunucLoginFloat 18s ease-in-out ${delay} infinite alternate`,
    '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
    ...pos
})

export const cardSx = (theme) => ({
    mb: 2,
    borderRadius: 4,
    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)'}`,
    background: theme.palette.mode === 'dark' ? 'rgba(24,24,32,0.72)' : 'rgba(255,255,255,0.78)',
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
    boxShadow: theme.palette.mode === 'dark'
        ? '0 24px 60px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(129,140,248,0.08)'
        : '0 24px 60px -16px rgba(79,70,229,0.28), 0 4px 14px rgba(15,23,42,0.06)',
    '& .MuiCardContent-root': {p: {xs: 3, sm: 4}},
    '& .MuiCardContent-root:last-child': {pb: {xs: 3, sm: 4}},
    animation: 'lunucLoginIn .5s cubic-bezier(.2,.8,.2,1) both',
    '@media (prefers-reduced-motion: reduce)': {animation: 'none'}
})

export const AuthLayout = ({children}) => {
    const login = (typeof _app_ !== 'undefined' && _app_.login) || {}
    const isDark = useTheme().palette.mode === 'dark'
    return <Box sx={(theme) => ({
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        px: 2,
        py: 6,
        background: theme.palette.mode === 'dark'
            ? 'linear-gradient(160deg,#0b0b12 0%,#14142a 100%)'
            : 'linear-gradient(160deg,#eef2ff 0%,#fdf2f8 100%)',
        '@keyframes lunucLoginFloat': {
            from: {transform: 'translate3d(0,0,0) scale(1)'},
            to: {transform: 'translate3d(40px,30px,0) scale(1.15)'}
        },
        '@keyframes lunucLoginIn': {
            from: {opacity: 0, transform: 'translate3d(0,14px,0)'},
            to: {opacity: 1, transform: 'translate3d(0,0,0)'}
        }
    })}>
        <Box aria-hidden sx={(theme) => blobSx(theme.palette.primary.main, '38rem', {top: '-12rem', left: '-10rem'}, '0s')}/>
        <Box aria-hidden sx={(theme) => blobSx(theme.palette.secondary.main, '30rem', {bottom: '-10rem', right: '-8rem'}, '-6s')}/>
        <Box sx={{position: 'relative', width: '100%', maxWidth: 440}}>
            <Box component="img"
                 alt="Logo"
                 src={(isDark && login.logoDark) || login.logo || DEFAULT_LOGO}
                 sx={{
                     display: 'block',
                     mx: 'auto',
                     mb: 4,
                     height: 'auto',
                     maxHeight: '3.5rem',
                     maxWidth: '70%',
                     filter: isDark && !login.logoDark
                         ? 'invert(1) hue-rotate(180deg) drop-shadow(0 6px 18px rgba(129,140,248,0.4))'
                         : 'drop-shadow(0 6px 18px rgba(99,102,241,0.35))',
                     animation: 'lunucLoginIn .5s cubic-bezier(.2,.8,.2,1) both',
                     '@media (prefers-reduced-motion: reduce)': {animation: 'none'}
                 }}/>
            {children}
        </Box>
    </Box>
}

export default AuthLayout
