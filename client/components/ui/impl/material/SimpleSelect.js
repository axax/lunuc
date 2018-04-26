import React from 'react'
import PropTypes from 'prop-types'
import Input from 'material-ui/Input'
import Select from 'material-ui/Select'
import {MenuItem} from 'material-ui/Menu'
import {InputLabel} from 'material-ui/Input';
import {FormControl} from 'material-ui/Form';
import { withStyles } from 'material-ui/styles';


const styles = theme => ({
    formControl: {
        margin: theme.spacing.unit,
        minWidth: 120,
    },
});


class SimpleSelect extends React.Component {
    render() {
        const {onChange, value, items, label, classes} = this.props

        const name = 'name_' + Math.random()

        return <FormControl className={classes.formControl}>
            {label && <InputLabel htmlFor={name}>{label}</InputLabel>}
            <Select
                value={value}
                onChange={onChange}
                inputProps={{
                    name,
                    id: name,
                }}
                input={<Input/>}
            >
                {
                    items.map(item => {
                        return <MenuItem key={item.value} value={item.value}>{item.name}{item.hint &&
                        <em>&nbsp;({item.hint})</em>}</MenuItem>
                    })
                }
            </Select>
        </FormControl>
    }
}


SimpleSelect.propTypes = {
    items: PropTypes.array.isRequired,
    label: PropTypes.string,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(SimpleSelect)