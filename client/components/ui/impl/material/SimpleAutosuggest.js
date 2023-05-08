import * as React from 'react'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'

export default function SimpleAutosuggest(props) {

    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [options, setOptions] = React.useState(props.options || [])

   /* React.useEffect(() => {
        let active = true

        if (!loading) {
            return undefined
        }

        return () => {
            active = false
        }
    }, [loading])*/

    /*React.useEffect(() => {
        if (!open) {
            //setOptions([])
        }
    }, [open])*/
    const getData = (text)=>{

        if(!props.apiUrl) {
            return
        }
        const textTrimmed = text.trim()
        setLoading(textTrimmed?true:false)

        if(textTrimmed){

            const abortController = new AbortController()
            fetch(`${props.apiUrl.replaceAll('%search%',text)}`,
                {signal:abortController.signal})
            .then(response => {

                if (response.status === 200) {
                    response.json().then(json=>{

                        const allData = []
                        Object.keys(json).forEach(key=> {
                            if (key !== 'total') {
                                json[key].forEach(item=>{
                                    let name = item.name
                                    if(item.name && item.name[_app_.lang]){
                                        name = item.name[_app_.lang]
                                    }
                                    allData.push({...item, name: `${key}: ${name}`, __type: key})
                                })
                            }
                        })
                        setOptions(allData)
                    }).catch(error=>{
                    })
                }
                setLoading(false)
            }).catch(error => {
                setLoading(false)
            })

        }else{
            setOptions([])
        }


    }

    return (
        <Autocomplete
            fullWidth={props.fullWidth}
            sx={props.sx}
            value={props.value}
            freeSolo={props.freeSolo}
            clearOnEscape={true}
            open={open}
            onOpen={() => {
                setOpen(true);
            }}
            onClose={() => {
                setOpen(false);
            }}
            onBlur={props.onBlur}
            onChange={props.onChange}
            onInputChange={(event, text)=>{
                getData(text)
                if(props.onInputChange){
                    props.onInputChange(event, text)
                }
            }}
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
