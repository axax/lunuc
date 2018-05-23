import React from 'react'
import PropTypes from 'prop-types'
import Switch from 'material-ui/Switch'
import {FormControlLabel} from 'material-ui/Form'
import { withStyles } from 'material-ui/styles';


const styles = {
    labelContrast: {
        color:'#fff'
    },
};

export const SimpleSwitch = ({label,classes,contrast, ...rest}) => {
    return <FormControlLabel
        classes={{
            label: contrast && classes.labelContrast,
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
    label: PropTypes.string,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(SimpleSwitch)