import React from 'react'
import PropTypes from 'prop-types'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import { alpha, styled } from '@mui/material/styles'

const DarkSwitch = styled(Switch)(({ theme }) => ({
    '& .MuiSwitch-switchBase.Mui-checked': {
        color: '#fff',
        '&:hover': {
            backgroundColor: alpha(theme.palette.secondary.main, theme.palette.action.hoverOpacity),
        },
    },
    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
        backgroundColor: theme.palette.secondary.main,
        opacity: 1,
    },
}));

export const SimpleSwitch = ({label,className, sx, dark, ...rest}) => {
    return <FormControlLabel
        sx={sx}
        classes={{
            root: className,
        }}
        control={
            dark?<DarkSwitch
                {...rest}
            />:<Switch
                {...rest}
            />
        }
        label={label}
    />
}


SimpleSwitch.propTypes = {
    label: PropTypes.string
}

export default SimpleSwitch
