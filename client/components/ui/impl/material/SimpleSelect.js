import React from 'react'
import PropTypes from 'prop-types'
import Input from '@material-ui/core/Input'
import Select from '@material-ui/core/Select'
import MenuItem from '@material-ui/core/MenuItem'
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import { withStyles } from '@material-ui/core/styles';


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