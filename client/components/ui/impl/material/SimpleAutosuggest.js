import * as React from 'react'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'

export default function SimpleAutosuggest(props) {

    const [open, setOpen] = React.useState(false)
    const [options, setOptions] = React.useState(props.options || [])
    const loading = open && options.length === 0

    React.useEffect(() => {
        let active = true

        if (!loading) {
            return undefined
        }

        return () => {
            active = false
        }
    }, [loading])

    React.useEffect(() => {
        if (!open) {
            //setOptions([])
        }
    }, [open])

    return (
        <Autocomplete
            sx={props.sx}
            value={props.value}
            freeSolo={props.freeSolo}
            open={open}
            onOpen={() => {
                setOpen(true);
            }}
            onClose={() => {
                setOpen(false);
            }}
            onBlur={props.onBlur}
            onChange={props.onChange}
            onInputChange={props.onInputChange}
            isOptionEqualToValue={(option, value) => option.name === value.name}
            getOptionLabel={(option) => {
                if(option.name){
                    return option.name
                }
                const foundOption = options.find(item=>item.value===option)
                if(foundOption){
                    return foundOption.name
                }
                return option
            }
            }
            options={options}
            loading={loading}
            renderInput={(params) => {
                return <TextField
                    onClick={props.onClick}
                    placeholder={props.placeholder}
                    {...params}
                    InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                            <React.Fragment>
                                {loading ? <CircularProgress color="inherit" size={20}/> : null}
                                {params.InputProps.endAdornment}
                            </React.Fragment>
                        ),
                    }}
                />
            }}
        />
    )
}
