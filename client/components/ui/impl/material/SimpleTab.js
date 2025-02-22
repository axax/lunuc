import React from 'react'

import Typography from '@mui/material/Typography'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Box from '@mui/material/Box'
import styled from '@emotion/styled'

/*
export const StyledTabs = styled(Tabs)({
    root: {
        borderBottom: '1px solid #e8e8e8',
    },
    indicator: {
        backgroundColor: '#1890ff',
    },
})


const StyledTab = styled(Tab)(({theme}) => ({
    root: {
        textTransform: 'none',
        minWidth: 72,
        fontWeight: theme.typography.fontWeightRegular,
        marginRight: theme.spacing(4),
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
            color: '#40a9ff',
            opacity: 1,
        },
        '&$selected': {
            color: '#1890ff',
            fontWeight: theme.typography.fontWeightMedium,
        },
        '&:focus': {
            color: '#40a9ff',
        },
    }
}))
*/

const StyledTabs = styled(Tabs)(props=>({
    borderBottom: props.orientation!=='vertical' && '1px solid #f0f0f0',
    borderRight: props.orientation==='vertical' && '1px solid #f0f0f0',
    '& .MuiTabs-indicator': {
        backgroundColor: '#1890ff',
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
    color: 'rgba(0, 0, 0, 0.85)',
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
        color: '#40a9ff',
        opacity: 1,
    },
    '&.Mui-selected': {
        color: '#1890ff',
        fontWeight: theme.typography.fontWeightMedium,
    },
    '&.Mui-focusVisible': {
        backgroundColor: '#d1eaff',
    },
}))


export const SimpleTabs = (props) => <StyledTabs {...props}/>
export const SimpleTab = (props) => <StyledTab disableRipple {...props} />


export const SimpleTabPanel = (props) => {
    const {children, value, index, ...other} = props

    return (
        <Typography
            component="div"
            hidden={value !== index}
            {...other}
        >
            {value === index && <Box sx={{ mt: 3, ml:3, minHeight:'100%' }}>{children}</Box>}
        </Typography>
    )
}
