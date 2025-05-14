import React from 'react'
import PropTypes from 'prop-types'
import Input from '@mui/material/Input'
import Chip from '@mui/material/Chip'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import ListSubheader from '@mui/material/ListSubheader'
import ListItemText from '@mui/material/ListItemText'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import Avatar from '@mui/material/Avatar'
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import styled from '@emotion/styled'
import {getIconByKey} from './icon'

const StyledChips = styled.div`
    display: flex;
    flex-wrap: wrap;
`
const StyledChip = styled(Chip)({
    height: 'auto',
    padding: '2px',
    margin: '-2px 2px'
})


function matchSingleValue(value, list) {
    if (value.constructor === String) {
        for (let i = 0; i < list.length; i++) {
            if (list[i].value === value) {
                return list[i].name
            }
        }
    }
    return value
}

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
        const {onChange, InputLabelProps, items, label, readOnly, className, multi, disabled, hint, fullWidth, error, style, sx} = this.props
        const name = this.props.name || ('name_' + Math.random())
        let value = this.props.value===undefined?'':this.props.value
        if (value) {
            if (multi && value.constructor !== Array) {
                value = [value]
            }
        } else if (multi) {
            value = []
        }
        return <FormControl className={className}
                            sx={sx}
                            disabled={disabled}
                            fullWidth={fullWidth}
                            style={style}
                            error={error}>
            {label && <InputLabel htmlFor={name} {...InputLabelProps}>{label}</InputLabel>}
            <Select
                displayEmpty={true}
                multiple={multi}
                value={value}
                readOnly={readOnly}
                onChange={onChange}
                inputProps={{
                    name,
                    id: name,
                }}
                input={<Input/>}
                renderValue={selected => (
                    selected.constructor === Array ?
                        <StyledChips>
                            {selected.map(value => (
                                <StyledChip key={value} label={matchSingleValue(value, items)}/>
                            ))}
                        </StyledChips> : this.itemNameByValue(selected)
                )}
            >
                {
                    items.map(item => {
                        if (item.constructor === Object) {
                            const Icon = getIconByKey(item.icon, item.icon)
                            return [item.subHeader ? <ListSubheader>{item.subHeader}</ListSubheader> : null,
                                <MenuItem key={item.value}
                                          value={item.value}>

                                    {Icon ? (Icon.constructor===String?<ListItemAvatar>
                                        <Avatar src={Icon}/>
                                    </ListItemAvatar>:<Icon />):null}

                                    <ListItemText primary={item.name} secondary={item.hint}/>
                                </MenuItem>]
                        } else {
                            return <MenuItem key={item} value={item}>{item}</MenuItem>
                        }
                    })
                }
            </Select>
            {hint && <FormHelperText sx={{ml:0}}>{hint}</FormHelperText>}
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
    hint: PropTypes.string
}

export default SimpleSelect
