import * as React from 'react'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import {setKeyValue, useKeyValues} from '../../../../util/keyvalue'
import HistoryIcon from '@mui/icons-material/History'
import {addToSearchHistory} from '../../../../util/searchHistory.mjs'

const contextAwareSplit = (text, separator) => {
    const result = []
    let token = '', depth = 0

    for (const char of text) {
        if (char === '{') depth++
        else if (char === '}') depth--

        if (depth === 0 && char === separator) {
            if (token) result.push(token)
            token = ''
        } else {
            token += char
        }
    }
    if (token) result.push(token)

    return result
}

/*
 Options are loaded either from props.apiUrl (response {Type: [items]}) or with props.loadOptions(text) => Promise of
 options. With loadOptions the request starts after props.loadDelay ms (default 200) without typing, and only the
 answer of the latest request is used. Option attributes besides name: secondary (second line), key (unique key),
 replaceText (choosing the option replaces the search text instead of calling onChange, e.g. "did you mean").
 */
export default function SimpleAutosuggest(props) {

    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [hadFocus, setHadFocus] = React.useState(false)
    const [text, setText] = React.useState(props.value || '')
    const [options, setOptions] = React.useState(props.options || [])
    // loadOptions: only the latest request counts, requests start after a short pause in typing
    const requestRef = React.useRef(0)
    const timerRef = React.useRef(null)
    React.useEffect(() => () => clearTimeout(timerRef.current), [])

    const settingKey = `SimpleAutosuggestHistory-${props.historyKey}`
    const keyValueData = hadFocus && props.historyKey?useKeyValues([settingKey]):{data:{}}
    const settings = keyValueData.data[settingKey] || {}


    const finalOptions = []
    if(settings.history){
        // newest first (without mutating the stored array)
        settings.history.forEach(historyText=>{
            if(!text || historyText.indexOf(text)>=0) {
                finalOptions.push({name: historyText, history: true})
            }
        })
    }
    finalOptions.push(...options)

    const getData = (searchData)=>{
        if(props.loadOptions) {
            clearTimeout(timerRef.current)
            const textTrimmed = searchData.text.trim()
            const requestId = ++requestRef.current
            if(!textTrimmed) {
                setOptions([])
                setLoading(false)
                return
            }
            setLoading(true)
            timerRef.current = setTimeout(() => {
                Promise.resolve(props.loadOptions(textTrimmed)).then(loaded => {
                    if(requestId === requestRef.current) {
                        setOptions(loaded || [])
                        setLoading(false)
                    }
                }).catch(() => {
                    if(requestId === requestRef.current) {
                        setLoading(false)
                    }
                })
            }, props.loadDelay !== undefined ? props.loadDelay : 200)
            return
        }
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
    const finalValue = props.multipleSeparator ? contextAwareSplit(text, props.multipleSeparator).filter(f=>f) : text
    return (
        <Autocomplete
            multiple={!!props.multipleSeparator}
            className={props.className}
            autoHighlight={true}
            autoComplete={true}
            onFocus={()=>{
                setHadFocus(true)
            }}
            fullWidth={props.fullWidth}
            sx={props.sx}
            value={finalValue}
            freeSolo={props.freeSolo}
            clearOnEscape={true}
            open={open}
            onOpen={() => {
                setOpen(true)
            }}
            onClose={() => {
                setOpen(false)
            }}
            onBlur={(e)=>{
                const value = e.target.value
                if(value && props.multipleSeparator){
                    if(finalValue.indexOf(value)<0){
                        finalValue.push(value)
                        const newText= finalValue.join(props.multipleSeparator)
                       // setText(newText)
                        //e.target.value = ''
                        if(props.onChange) {
                            props.onChange(e,newText , value)
                        }
                    }
                }
                if(props.onBlur) {
                    props.onBlur(e)
                }
            }}
            onChange={(e, item)=>{
                if(!item){
                    return
                }
                if(item.replaceText) {
                    // e.g. "did you mean": search again with the new text
                    setText(item.replaceText)
                    getData({text: item.replaceText})
                    setTimeout(()=> {
                        setOpen(true)
                    },0)
                    return
                }
                if(!item.history) {
                    if(props.historyKey) {
                        const history = addToSearchHistory(settings.history, text)
                        if(history !== settings.history) {
                            setKeyValue({key: settingKey, value: {...settings, history}})
                        }
                    }

                    if(props.multipleSeparator){
                        item = item.map(i=>i.name?i.name:i).join(props.multipleSeparator)
                        setText(item)
                    }
                    if(props.onChange) {
                        props.onChange(e, item, text)
                    }
                }else{
                    setText(item.name)
                    setTimeout(()=> {
                        setOpen(true)
                    },0)
                }
            }}
            onInputChange={(event, newInput)=>{
                getData({text: newInput})
                if(!props.multipleSeparator){
                    setText(newInput)
                }
                if(props.onInputChange){
                    props.onInputChange(event, newInput)
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
                    <li key={option.key || key} {...optionProps}>
                        {option.history && <HistoryIcon sx={{marginRight:1}} />}
                        {option.secondary ? <div style={{minWidth: 0}}>
                            <div style={option.replaceText ? {fontStyle: 'italic'} : undefined}>{option.name}</div>
                            <div style={{fontSize: '0.8em', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{option.secondary}</div>
                        </div> : <span style={option.replaceText ? {fontStyle: 'italic'} : undefined}>{option.name}</span>}
                    </li>
                );
            }}
            renderInput={(params) => {

                return <TextField
                    onClick={props.onClick}
                    placeholder={props.placeholder}
                    label={props.label}
                    name={props.name}
                    {...params}
                    sx={{margin:0}}
                    slotProps={{
                        htmlInput: params.slotProps?.htmlInput,
                        inputLabel:{
                            ...params.slotProps?.inputLabel,
                            shrink: props.labelShrink
                        },
                        input:{
                            ...params.slotProps?.input,
                            name:props.name,
                            endAdornment: (
                                <React.Fragment>
                                    {loading ? <CircularProgress color="inherit" size={20}/> : null}
                                    {params.slotProps?.input?.endAdornment}
                                </React.Fragment>
                            ),
                        }
                    }}
                />
            }}
        />
    )
}
