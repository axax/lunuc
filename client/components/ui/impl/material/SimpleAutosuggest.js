import * as React from 'react'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import {setKeyValue, useKeyValues} from '../../../../util/keyvalue'
import HistoryIcon from '@mui/icons-material/History'

export default function SimpleAutosuggest(props) {

    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [hadFocus, setHadFocus] = React.useState(false)
    const [text, setText] = React.useState(props.value || '')
    const [options, setOptions] = React.useState(props.options || [])

    const settingKey = `SimpleAutosuggestHistory-${props.historyKey}`
    const keyValueData = hadFocus && props.historyKey?useKeyValues([settingKey]):{data:{}}
    const settings = keyValueData.data[settingKey] || {}


    const finalOptions = options.slice(0)
    if(settings.history){
        settings.history.reverse().forEach(historyText=>{
            if(!text || historyText.indexOf(text)>=0) {
                finalOptions.unshift({name: historyText, history: true})
            }
        })
    }

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
    const getData = (searchData)=>{
        if(!props.apiUrl) {
            return
        }
        let apiUrl
        if(props.apiUrl instanceof Function){
            apiUrl = props.apiUrl(searchData)
        }else{
            apiUrl = props.apiUrl
        }
        const textTrimmed = searchData.text.trim()
        setLoading(textTrimmed?true:false)

        if(textTrimmed){

            const abortController = new AbortController()
            fetch(`${apiUrl.replaceAll('%search%',textTrimmed)}`,{signal:abortController.signal})
            .then(response => {

                if (response.status === 200) {
                    response.json().then(json=>{

                        const allData = []
                        Object.keys(json).forEach(key=> {
                            if (key !== 'total') {
                                json[key].forEach(item=>{
                                    let displayName
                                    if(props.nameRender){
                                        displayName = props.nameRender(item, key)
                                    }else{
                                        let name = item.name
                                        if(item.name && item.name[_app_.lang]){
                                            name = item.name[_app_.lang]
                                        }
                                        displayName = `${key}: ${name}`
                                    }
                                    allData.push({...item, name: displayName, __type: key})
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
            autoHighlight={true}
            autoComplete={true}
            onFocus={()=>{
                setHadFocus(true)
            }}
            fullWidth={props.fullWidth}
            sx={props.sx}
            value={text}
            freeSolo={props.freeSolo}
            clearOnEscape={true}
            open={open}
            onOpen={() => {
                setOpen(true)
            }}
            onClose={() => {
                setOpen(false)
            }}
            onBlur={props.onBlur}
            onChange={(e, item)=>{
                if(!item){
                    return
                }
                if(!item.history) {
                    if(props.historyKey) {
                        if(!settings.history){
                            settings.history = []
                        }
                        const index = settings.history.indexOf(text)
                        if (index !== -1) {
                            settings.history.splice(index, 1)
                        }
                        settings.history.unshift(text)
                        settings.history.length = Math.min(settings.history.length, 50)

                        setKeyValue({key: settingKey, value: settings})
                    }
                    props.onChange(e, item, text)
                }else{
                    setText(item.name)
                    setTimeout(()=> {
                        setOpen(true)
                    },0)

                }
            }}
            onInputChange={(event, text)=>{
                setText(text)
                getData({text})
                if(props.onInputChange){
                    props.onInputChange(event, text)
                }
            }}
            isOptionEqualToValue={(option, value) => option.name === value.name}
            getOptionLabel={(option) => {
                if(option.name){
                    return option.name
                }
                const foundOption = finalOptions.find(item=>item.value===option)
                if(foundOption){
                    return foundOption.name
                }
                return option
            }}
            filterOptions={props.filterOptions}
            options={finalOptions}
            loading={loading}
            renderOption={(props, option, { selected }) => {
                const { key, ...optionProps } = props
                return (
                    <li key={key} {...optionProps}>
                        {option.history && <HistoryIcon sx={{marginRight:1}} />}
                        {option.name}
                    </li>
                );
            }}
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
