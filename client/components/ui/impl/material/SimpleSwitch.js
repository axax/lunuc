import React from 'react'
import PropTypes from 'prop-types'
import Switch from 'material-ui/Switch'
import {FormControlLabel} from 'material-ui/Form'


export const SimpleSwitch = ({label, ...rest}) => {
    return <FormControlLabel
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