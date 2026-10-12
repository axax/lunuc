import React from 'react'

import Typography from '@mui/material/Typography'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Box from '@mui/material/Box'
import styled from '@emotion/styled'
import {alpha} from '@mui/material/styles'


const StyledTabs = styled(Tabs)(({orientation, theme}) => ({
    borderBottom: orientation !== 'vertical' && '1px solid ' + theme.palette.divider,
    borderRight: orientation === 'vertical' && '1px solid ' + theme.palette.divider,
    '& .MuiTabs-indicator': {
        backgroundColor: theme.palette.primary.main,
    }
}))

const StyledTab = styled((props) => <Tab disableRipple {...props} />)(({ theme }) => ({
    textTransform: 'none',
    minWidth: 72,
    [theme.breakpoints.up('sm')]: {
        minWidth: 0,
    },
    fontWeight: theme.typography.fontWeightRegular,
    marginRight: theme.spacing(1),
    color: theme.palette.text.primary,
    fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
        '"Apple Color Emoji"',
        '"Segoe UI Emoji"',
        '"Segoe UI Symbol"',
    ].join(','),
    '&:hover': {
        color: theme.palette.primary.light,
        opacity: 1,
    },
    '&.Mui-selected': {
        color: theme.palette.primary.main,
        fontWeight: theme.typography.fontWeightMedium,
    },
    '&.Mui-focusVisible': {
        backgroundColor: alpha(theme.palette.primary.main, 0.16),
    },
}))


export const SimpleTabs = (props) => <StyledTabs {...props}/>
export const SimpleTab = (props) => <StyledTab disableRipple {...props} />


export const SimpleTabPanel = (props) => {
    // contentSx: optional sx for the content box (default: mt 3, ml 3)
    const {children, value, index, contentSx, ...other} = props

    return (
        <Typography
            component="div"
            hidden={value !== index}
            {...other}
        >
            {value === index && <Box sx={contentSx || { mt: 3, ml:3, minHeight:'100%' }}>{children}</Box>}
        </Typography>
    )
}
