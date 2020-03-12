import React from 'react'
import PropTypes from 'prop-types'
import {InputLabel, TextField, FormControl, Paper, MenuItem, withStyles, Chip, Avatar, IconButton, InputAdornment, SearchIcon} from 'ui/admin'
import {withApollo} from 'react-apollo'
import { ApolloClient } from 'apollo-client'
import gql from 'graphql-tag'
import {getImageTag, getImageSrc} from 'client/util/media'
import {queryStatemantForType} from 'util/types'
import {typeDataToLabel} from 'util/typesAdmin'
import classNames from 'classnames'

const styles =  theme => {
    return {
        root: {
            position: 'relative',
            zIndex:'auto',
            marginLeft:0
        },
        suggestions: {
            position: 'absolute',
            zIndex: 999,
            top:'100%',
            maxWidth: '100%'
        },
        clip:{
            margin:theme.spacing(2)+'px auto 0px '+theme.spacing(1)+'px;'
        },
        textField:{
            margin:'0',
        }
    }
}


class TypePicker extends React.Component {
    constructor(props) {
        super(props)

        this.state = {
            value: props.value || [],
            data: null,
            hasFocus: true,
            selIdx: 0,
            textValue: ''
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {

        if (nextProps.value && nextProps.value !== prevState.valueOri) {
            return {...prevState, value: nextProps.value}
        }
        return null
    }

    shouldComponentUpdate(props, state) {
        return state.value !== this.state.value || state.textValue !== this.state.textValue || state.data !== this.state.data || state.selIdx !== this.state.selIdx
    }

    render() {
        const {classes, placeholder, multi, error, helperText, className, fullWidth, pickerField, type, filter, label} = this.props
        const {data, hasFocus, selIdx, value, textValue} = this.state

        console.log(`render TypePicker | hasFocus=${hasFocus}`,data)
        return <FormControl
            fullWidth={fullWidth} className={classNames(classes.root, className)}>
            { !value.length || multi ?
            <TextField error={error}
                       fullWidth={fullWidth}
                       className={classes.textField}
                       helperText={helperText}
                       value={textValue}
                       onChange={this.handleChange.bind(this)}
                       onKeyDown={this.handleKeyDown.bind(this)}
                       onFocus={() => this.setState({hasFocus: true})}
                       onBlur={this.handleBlur.bind(this)}
                       placeholder={placeholder}
                       label={label}
                       InputLabelProps={{
                           shrink: true,
                       }}
                       InputProps={{
                           endAdornment: (
                               <InputAdornment position="end">
                                   <IconButton
                                       edge="end"
                                       aria-label="toggle password visibility"
                                       onClick={()=>{

                                           const w = screen.width/3*2, h = screen.height/3*2,left = (screen.width/2)-(w/2),top = (screen.height/2)-(h/2)

                                           const newwindow = window.open(
                                               `/admin/types/?noLayout=true&fixType=${type}${filter?'&baseFilter='+encodeURIComponent(filter):''}`, '_blank' ,
                                               'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=yes, copyhistory=no, width='+w+', height='+h+', top='+top+', left='+left)

                                           newwindow.addEventListener('beforeunload',(e) => {
                                               this.selectValue(newwindow.resultValue)
                                               delete e['returnValue']
                                           })
                                       }}
                                       onMouseDown={()=>{}}
                                   >
                                       <SearchIcon />
                                   </IconButton>
                               </InputAdornment>
                           ),
                       }}
            /> : <InputLabel className={classes.label} shrink>{label}</InputLabel> }


            { value.map((value, i) =>
                <Chip key={i} className={classes.clip} label={typeDataToLabel(value, pickerField)} onDelete={this.handleRemovePick.bind(this, i)}
                      avatar={value.__typename === 'Media' ? <Avatar src={getImageSrc(value, {height: 30})}/> : null}/>)
            }

            <Paper className={classes.suggestions} square>

                {hasFocus && data && data.results && data.results.map((item, idx) =>
                    <MenuItem
                        onClick={this.handlePick.bind(this, idx)}
                        selected={selIdx === idx}
                        key={idx}
                        component="div"
                        style={{
                            fontWeight: selIdx === idx ? 500 : 400,
                        }}
                    >{item.__typename === 'Media' ? getImageTag(item, {height: 30}) : ''} {typeDataToLabel(item, pickerField)}
                    </MenuItem>
                )}


            </Paper>
        </FormControl>
    }

    handleRemovePick(idx) {
        const value = this.state.value.slice(0)
        value.splice(idx, 1)

        this.props.onChange({target: {value, name: this.props.name}})
        this.setState({value})

    }

    handlePick(idx) {
        this.selectValue(this.state.data.results[idx])
    }

    selectValue(item){
        if(item) {
            const value = (this.state.value ? this.state.value.slice(0) : [])
            value.push({__typename: this.props.type, ...item})
            this.props.onChange({target: {value, name: this.props.name}})
            this.setState({value, textValue: '', hastFocus: false, data: null})
        }
    }

    handleChange(e) {
        const v = e.target.value.trim()
        if (v === '') {
            this.setState({data: null, textValue: v})
        } else {
            this.setState({textValue: v})
            const {searchFields} = this.props
            let filter=''
            if( searchFields){
                searchFields.forEach(field=>{
                    filter += field+'='+e.target.value+' '
                })
            }else{
                filter = e.target.value
            }
            this.getData(filter+(this.props.filter?' && '+this.props.filter:''))
        }
    }

    handleBlur(e) {
        setTimeout(() => {
            if (this.state.hasFocus)
                this.setState({hasFocus: false})
        }, 500)
    }

    handleKeyDown(e) {
        const {data, selIdx} = this.state
        if (data && data.results) {
            const l = data.results.length
            if (e.key === 'ArrowDown') {
                this.setState({selIdx: selIdx >= l - 1 ? 0 : selIdx + 1})
            } else if (e.key === 'ArrowUp') {
                this.setState({selIdx: selIdx <= 0 ? l - 1 : selIdx - 1})
            } else if (e.key === 'Enter') {
                this.handlePick(selIdx)
            }
        }
    }

    getData(filter) {
        const {client, type, fields, pickerField} = this.props
        if (type) {

            const nameStartLower = type.charAt(0).toLowerCase() + type.slice(1) + 's'


            let queryFields
            if (pickerField) {
                queryFields = pickerField
            } else if (fields) {
                queryFields = fields.join(' ')
            } else {
                queryFields = queryStatemantForType(type)
            }
            const variables = {filter},
                gqlQuery = gql`query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{_id ${queryFields}}}}`

            try {
                const storeData = client.readQuery({
                    query: gqlQuery,
                    variables
                })
                if (storeData && storeData[nameStartLower]) {
                    // oh data are available in cache. show them first
                    this.setState({selIdx: 0, data: storeData[nameStartLower]})
                }
            } catch (e) {
            }
            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gqlQuery,
                variables
            }).then(response => {
                this.setState({hasFocus: true, selIdx: 0, data: response.data[nameStartLower]})
            }).catch(error => {
                console.log(error.message)
                this.setState({selIdx: 0, data: null})
            })
        }
    }
}

TypePicker.propTypes = {
    value: PropTypes.array,
    fields: PropTypes.array,
    searchFields: PropTypes.array,
    placeholder: PropTypes.string,
    filter: PropTypes.string,
    error: PropTypes.bool,
    helperText: PropTypes.string,
    multi: PropTypes.bool,
    name: PropTypes.string.isRequired,
    pickerField: PropTypes.string,
    type: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(withApollo(TypePicker))
