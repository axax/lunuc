import React from 'react'
import PropTypes from 'prop-types'
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
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import styled from '@emotion/styled'
import {getIconByKey} from './icon'
import {_t} from 'util/i18n.mjs'

const StyledChips = styled.div`
    display: flex;
    flex-wrap: wrap;
`
const StyledChip = styled(Chip)({
    height: 'auto',
    padding: '2px',
    margin: '-2px 2px'
})

const StyledSearchBox = styled.div`
    padding: 4px 8px 8px 8px;
`


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

function itemMatchesSearch(item, search) {
    if (!search) {
        return true
    }
    const needle = search.toLowerCase()
    if (item.constructor === Object) {
        return (item.name && String(item.name).toLowerCase().includes(needle)) ||
            (item.value !== undefined && item.value !== null && String(item.value).toLowerCase().includes(needle)) ||
            (item.hint && String(item.hint).toLowerCase().includes(needle))
    }
    return String(item).toLowerCase().includes(needle)
}

class SimpleSelect extends React.Component {

    state = {
        search: ''
    }

    searchInputRef = React.createRef()

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

    handleSearchChange = event => {
        this.setState({search: event.target.value})
    }

    handleSearchKeyDown = event => {
        // Stop keystrokes from reaching the Select/Menu (which would otherwise
        // treat them as type-ahead navigation or close the menu on Space).
        if (event.key !== 'Escape') {
            event.stopPropagation()
        }
    }

    handleClose = () => {
        if (this.props.searchable) {
            this.setState({search: ''})
        }
    }

    handleMenuEntered = () => {
        // Focus the search field once the menu has fully opened (after its enter
        // transition), rather than relying on TextField's autoFocus alone: that fires
        // at mount time while the Menu is still animating in / effectively hidden, so
        // browsers can silently ignore it. Doing it here also overrides MUI's own
        // default focus-the-selected-item behaviour.
        if (this.props.searchable && this.searchInputRef.current) {
            this.searchInputRef.current.focus()
        }
    }

    render() {
        const {onChange, slotProps = {}, items, label, readOnly, className, multi, disabled, hint, fullWidth, error, style, sx, searchable, searchPlaceholder} = this.props
        const name = this.props.name || ('name_' + Math.random())
        let value = this.props.value===undefined?'':this.props.value
        if (value) {
            if (multi && value.constructor !== Array) {
                value = [value]
            }
        } else if (multi) {
            value = []
        }
        const {search} = this.state
        const filteredItems = searchable ? items.filter(item => itemMatchesSearch(item, search)) : items
        const SearchIcon = searchable ? getIconByKey('search') : null
        return <FormControl className={className}
                            sx={sx}
                            disabled={disabled}
                            fullWidth={fullWidth}
                            style={style}
                            error={error}>
            {label && <InputLabel htmlFor={name} shrink {...slotProps.inputLabel}>{label}</InputLabel>}
            <Select
                label={label}
                displayEmpty={true}
                multiple={multi}
                value={value}
                readOnly={readOnly}
                onChange={onChange}
                onClose={this.handleClose}
                MenuProps={searchable ? {
                    slotProps: {
                        list: {sx: {pt: 0}},
                        paper: {sx: {pt: 0}},
                        transition: {onEntered: this.handleMenuEntered}
                    }
                } : undefined}
                slotProps={{
                    input: {
                        name,
                        id: name
                    }
                }}
                renderValue={selected => (
                    selected && selected.constructor === Array ?
                        <StyledChips>
                            {selected.map(value => (
                                <StyledChip key={value} label={matchSingleValue(value, items)}/>
                            ))}
                        </StyledChips> : this.itemNameByValue(selected)
                )}
            >
                {searchable && <ListSubheader key="__search" sx={{
                    bgcolor: 'background.paper',
                    zIndex: 1
                }}>
                    <StyledSearchBox>
                        <TextField
                            size="small"
                            fullWidth
                            autoFocus
                            inputRef={this.searchInputRef}
                            value={search}
                            placeholder={searchPlaceholder || _t('core.searchPlaceholder')}
                            onChange={this.handleSearchChange}
                            onKeyDown={this.handleSearchKeyDown}
                            onClick={event => event.stopPropagation()}
                            slotProps={{
                                input: {
                                    startAdornment: SearchIcon && <InputAdornment position="start">
                                        <SearchIcon fontSize="small"/>
                                    </InputAdornment>
                                }
                            }}
                        />
                    </StyledSearchBox>
                </ListSubheader>}
                {
                    searchable && filteredItems.length === 0 ?
                        <MenuItem disabled>{_t('core.noResults')}</MenuItem> :
                        filteredItems.map(item => {
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
    hint: PropTypes.string,
    searchable: PropTypes.bool,
    searchPlaceholder: PropTypes.string
}

export default SimpleSelect
