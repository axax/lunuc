import React from 'react'
import PropTypes from 'prop-types'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'

export const SimpleSwitch = ({label,className, sx, ...rest}) => {
    return <FormControlLabel
        sx={sx}
        classes={{
            root: className,
        }}
        control={
            <Switch
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
