import React from 'react'
import PropTypes from 'prop-types'
import Switch from '@material-ui/core/Switch'
import FormControlLabel from '@material-ui/core/FormControlLabel'
import { withStyles } from '@material-ui/core/styles';


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