import React from 'react'
import PropTypes from 'prop-types'
import Input from '@material-ui/core/Input'
import Chip from '@material-ui/core/Chip'
import Select from '@material-ui/core/Select'
import MenuItem from '@material-ui/core/MenuItem'
import ListSubheader from '@material-ui/core/ListSubheader'
import ListItemText from '@material-ui/core/ListItemText'
import ListItemAvatar from '@material-ui/core/ListItemAvatar'
import Avatar from '@material-ui/core/Avatar'
import InputLabel from '@material-ui/core/InputLabel';
import FormControl from '@material-ui/core/FormControl';
import FormHelperText from '@material-ui/core/FormHelperText';
import {withStyles} from '@material-ui/core/styles';


const styles = theme => ({
    formControl: {
        margin: theme.spacing(1),
        minWidth: 200,
    },
    chips: {
        display: 'flex',
        flexWrap: 'wrap'
    },
    chip: {
        height:'auto',
        padding: '2px',
        margin:'-2px 2px'
    }
});


class SimpleSelect extends React.Component {

    itemNameByValue(value) {

        for (const item of this.props.items) {
            if (item.constructor === Object) {
                if (item.value === value || item.key === value) {
                    return item.name
                }
            } else if (item === value) {
                return item
            }
        }
        return value

    }

    render() {
        const {onChange, items, label, classes, className, multi, disabled, hint, fullWidth, error} = this.props
        const name = this.props.name || ('name_' + Math.random())
        let value = this.props.value
        if( value ){
            if( multi && value.constructor !== Array){
                value = [value]
            }
        }

        return <FormControl className={className || classes.formControl} disabled={disabled} fullWidth={fullWidth}
                            error={error}>
            {label && <InputLabel htmlFor={name}>{label}</InputLabel>}
            <Select
                multiple={multi}
                value={value}
                onChange={onChange}
                inputProps={{
                    name,
                    id: name,
                }}
                input={<Input/>}
                renderValue={selected => (
                    selected.constructor === Array ?
                        <div className={classes.chips}>
                            {selected.map(value => (
                                <Chip key={value} label={value} className={classes.chip}/>
                            ))}
                        </div> : this.itemNameByValue(selected)
                )}
            >
                {
                    items.map(item => {
                        if (item.constructor === Object) {
                            return [item.subHeader?<ListSubheader>{item.subHeader}</ListSubheader>:null,<MenuItem key={item.value}
                                             value={item.value}>

                                {item.icon && <ListItemAvatar>
                                    <Avatar src={item.icon} />
                                </ListItemAvatar>}

                                <ListItemText primary={item.name} secondary={item.hint}/>
                            </MenuItem>]
                        } else {
                            return <MenuItem key={item} value={item}>{item}</MenuItem>
                        }
                    })
                }
            </Select>
            {hint && <FormHelperText>{hint}</FormHelperText>}
        </FormControl>
    }
}


SimpleSelect.propTypes = {
    onChange: PropTypes.func,
    value: PropTypes.any,
    multi: PropTypes.bool,
    disabled: PropTypes.bool,
    items: PropTypes.array.isRequired,
    label: PropTypes.string,
    name: PropTypes.string,
    hint: PropTypes.string,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(SimpleSelect)
