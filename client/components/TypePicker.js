import React from 'react'
import PropTypes from 'prop-types'
import {
    InputLabel,
    TextField,
    FormControl,
    Paper,
    MenuItem,
    withStyles,
    Chip,
    Avatar,
    IconButton,
    InputAdornment,
    DeleteIcon,
    SearchIcon,
    LaunchIcon
} from 'ui/admin'
import {getImageTag, getImageSrc} from 'client/util/media'
import {queryStatemantForType} from 'util/types'
import {typeDataToLabel} from 'util/typesAdmin'
import classNames from 'classnames'
import config from 'gen/config-client'

const {DEFAULT_LANGUAGE} = config

import {client} from '../middleware/graphql'
import Util from '../util'

const styles = theme => {
    return {
        root: {
            position: 'relative',
            zIndex: 'auto',
            marginLeft: 0
        },
        suggestions: {
            position: 'absolute',
            zIndex: 999,
            top: '100%',
            maxWidth: '100%'
        },
        clips: {
            display: 'flex',
            width: '100%',
            flexWrap: 'wrap',
            marginBottom: theme.spacing(2)
        },
        clip: {
            margin: theme.spacing(2) + 'px 0px 0px ' + theme.spacing(1) + 'px;',
            '&:first-child': {
                marginLeft: 0
            },
            position: 'relative'
        },
        clipMulti: {
            margin: theme.spacing(1) + 'px 0',
            width: '15%',
            position: 'relative'
        },
        clipDrop: {
            width: '1.6%',
            margin: '0 0 -' + theme.spacing(2) + 'px 0',
            opacity: '0',
            fontSize: '0.8rem',
            backgroundColor: 'rgba(255,0,0,0.2)'
        },
        dummyImg: {
            pointerEvents: 'none',
            maxWidth: '100%',
            maxHeight: '12rem',
            objectFit: 'cover'
        },
        dummyImgMulti: {
            maxWidth: 'none',
            width: '100%',
            maxHeight: '6rem'
        },
        dummyTxt: {
            pointerEvents: 'none',
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        },
        dummyRemove: {
            position: 'absolute',
            left: '5px',
            top: '5px',
            zIndex: 2,
            margin: 0,
            padding: '0.2rem',
            background: 'rgba(0,0,0,0.5)',
            color: '#fff'
        },
        openFile: {
            position: 'absolute',
            left: '40px',
            top: '5px',
            zIndex: 2,
            margin: 0,
            padding: '0.2rem',
            background: 'rgba(0,0,0,0.5)',
            color: '#fff'
        },
        textField: {
            margin: '0',
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

    pickTimeout = 0

    shouldComponentUpdate(props, state) {
        return state.textValue !== this.state.textValue ||
            state.value !== this.state.value ||
            state.data !== this.state.data ||
            props.error !== this.props.error ||
            state.selIdx !== this.state.selIdx
    }

    render() {
        const {classes, placeholder, multi, error, helperText, className, fullWidth, pickerField, type, filter, label} = this.props
        const {data, hasFocus, selIdx, value, textValue} = this.state
        console.log(`render TypePicker | hasFocus=${hasFocus}`, data)
        return <FormControl
            fullWidth={fullWidth} className={classNames(classes.root, className)}>
            {!value.length || multi ?
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
                                           onClick={() => {

                                               const w = screen.width / 3 * 2, h = screen.height / 3 * 2,
                                                   left = (screen.width / 2) - (w / 2),
                                                   top = (screen.height / 2) - (h / 2)

                                               const newwindow = window.open(
                                                   `${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/types/?noLayout=true&multi=${multi}&fixType=${type}${filter ? '&baseFilter=' + encodeURIComponent(filter) : ''}`, '_blank',
                                                   'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)

                                               setTimeout(() => {
                                                   newwindow.addEventListener('beforeunload', (e) => {
                                                       const value = newwindow.resultValue

                                                       delete value.createdBy

                                                       //TODO: move to extension
                                                       if (type === 'GenericData') {
                                                           try {
                                                               const structure = JSON.parse(value.definition.structure)

                                                               if (structure.pickerField) {
                                                                   const data = JSON.parse(value.data)
                                                                   const newData = {}

                                                                   const pickerFields = structure.pickerField.constructor === Array? structure.pickerField: [structure.pickerField]
                                                                   for( const pickerField of pickerFields){
                                                                       newData[pickerField] = data[pickerField]
                                                                   }

                                                                   newwindow.resultValue.data = JSON.stringify(newData)
                                                                   delete newwindow.resultValue.definition
                                                               }
                                                           } catch (e) {
                                                               console.log(e)
                                                           }
                                                       }
                                                       Util.removeNullValues(value, {
                                                           recursiv: true,
                                                           emptyObject: true,
                                                           emptyArray: true,
                                                           nullArrayItems: true
                                                       })
                                                       this.selectValue(value)
                                                       delete e['returnValue']
                                                   })
                                               }, 500)
                                           }}
                                       >
                                           <SearchIcon/>
                                       </IconButton>
                                   </InputAdornment>
                               ),
                           }}
                /> : <InputLabel className={classes.label} shrink>{label}</InputLabel>}

            <div className={classes.clips}>
                {value.map((value, i) =>
                    [
                        (value && value.__typename === 'Media' && value.mimeType && value.mimeType.indexOf('image') === 0 ?
                            <div draggable={true}
                                 data-index={i}
                                 onDragStart={(e) => {
                                     e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                 }}
                                 key={i}
                                 className={classNames(classes.clip, multi && classes.clipMulti)}>
                                <img className={classNames(classes.dummyImg, multi && classes.dummyImgMulti)}
                                     src={getImageSrc(value)}/>
                                <div className={classes.dummyTxt}>{typeDataToLabel(value, pickerField)}</div>

                                <IconButton className={classes.dummyRemove}
                                            edge="end"
                                            onClick={this.handleRemovePick.bind(this, i)}
                                >
                                    <DeleteIcon/>
                                </IconButton>

                                <IconButton className={classes.openFile}
                                            edge="end"
                                            onClick={()=>{
                                                window.open(getImageSrc(value), '_blank').focus()
                                            }}
                                >
                                    <LaunchIcon/>
                                </IconButton>

                            </div> :
                            <Chip draggable={true}
                                  data-index={i}
                                  onDragStart={(e) => {
                                      e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                  }}
                                  key={i}
                                  className={classNames(classes.clip)}
                                  label={typeDataToLabel(value, pickerField)}
                                  onDelete={this.handleRemovePick.bind(this, i)}
                                  onClick={()=>{
                                      if(value.type==='Media'){
                                          window.open(getImageSrc(value), '_blank').focus()
                                      }
                                  }}
                                  avatar={value && value.__typename === 'Media' && value.mimeType && value.mimeType.indexOf('image') === 0 ?
                                      <Avatar src={getImageSrc(value, {height: 30})}/> : null}/>),
                        <div key={'drop' + i}
                             data-index={i}
                             className={classes.clipDrop}
                             onDrop={(e) => {
                                 const targetIndex = parseInt(e.currentTarget.getAttribute('data-index')) + 1,
                                     sourceIndex = parseInt(e.dataTransfer.getData("text"))
                                 e.target.style.opacity = 0

                                 const value = this.state.value.slice(0),
                                     element = value.splice(sourceIndex, 1) [0]

                                 value.splice(targetIndex > sourceIndex ? targetIndex - 1 : targetIndex, 0, element)

                                 this.setState({value})
                                 this.props.onChange({target: {value, name: this.props.name}})

                             }}
                             onDragOver={(e) => {
                                 e.preventDefault()
                                 e.dataTransfer.dropEffect = 'copy'
                                 e.target.style.opacity = 1
                             }}
                             onDragLeave={(e) => {
                                 e.target.style.opacity = 0
                             }}>Hier einfügen</div>]
                )
                }
            </div>

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
                    >{item.__typename === 'Media' && item.mimeType && item.mimeType.indexOf('image') === 0 ? getImageTag(item, {height: 30}) : ''} {typeDataToLabel(item, pickerField)}
                    </MenuItem>
                )}


            </Paper>
        </FormControl>
    }

    handleRemovePick(idx) {
        const value = this.state.value.slice(0)
        value.splice(idx, 1)

        this.setState({value})
        this.props.onChange({target: {value, name: this.props.name}})

    }

    handlePick(idx) {
        const value = this.state.data.results[idx]

        const {type, pickerField} = this.props
        //TODO: move to extension
        if (type === 'GenericData') {
            if (pickerField && pickerField.constructor === String) {
                const data = JSON.parse(value.data)
                const newData = {[pickerField]: data[pickerField]}
                value.data = JSON.stringify(newData)
            }
        }
        Util.removeNullValues(value, {
            recursiv: true,
            emptyObject: true,
            emptyArray: true,
            nullArrayItems: true
        })

        this.selectValue(value)
    }

    selectValue(item) {
        if (item) {
            const value = (this.state.value ? this.state.value.slice(0) : [])
            if (item.forEach) {
                item.forEach(itm => {
                    value.push({__typename: this.props.type, ...itm})
                })
            } else {
                value.push({__typename: this.props.type, ...item})
            }
            this.props.onChange({target: {value, name: this.props.name}})
            this.setState({value, textValue: '', hastFocus: false, data: null})
        }
    }

    handleChange(e) {
        const value = e.target.value.trim()
        if (value === '') {
            this.setState({data: null, textValue: value})
        } else {
            this.setState({textValue: value})
            const {searchFields} = this.props
            let filter = ''
            if (searchFields) {
                searchFields.forEach(field => {
                    filter += field + '=' + e.target.value + ' '
                })
            } else {
                filter = e.target.value
            }
            clearTimeout(this.pickTimeout)
            this.pickTimeout = setTimeout(() => {
                clearTimeout(this.pickTimeout)
                this.pickTimeout = 0
                this.getData(filter + (this.props.filter ? ' && ' + this.props.filter : ''))
            }, 250)
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
        const {type, fields, pickerField} = this.props
        if (type) {

            const nameStartLower = type.charAt(0).toLowerCase() + type.slice(1) + 's'
            let queryFields
            if (pickerField && type!=='GenericData') {
                queryFields = pickerField
            } else if (fields && type!=='GenericData') {

                queryFields = ''

                fields.forEach(field => {
                    if (queryFields != '') {
                        queryFields += ' '
                    }
                    if (field.constructor === String) {
                        queryFields += field
                    } else {
                        Object.keys(field).forEach(key => {
                            queryFields += key + '{'
                            field[key].forEach(name => {
                                queryFields += name + ' '
                            })
                            queryFields += '}'
                        })
                    }
                })
            } else {
                queryFields = queryStatemantForType(type)
            }
            const variables = {filter, limit: 20},
                gqlQuery = `query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{_id __typename ${queryFields}}}}`

            const storeData = client.readQuery({
                query: gqlQuery,
                variables
            })
            if (storeData && storeData[nameStartLower]) {
                // oh data are available in cache. show them first
                this.setState({selIdx: 0, data: storeData[nameStartLower]})
            }

            client.query({
                fetchPolicy: 'network-only',
                query: gqlQuery,
                variables
            }).then(response => {
                if (this.pickTimeout === 0) {
                    this.setState({hasFocus: true, selIdx: 0, data: response.data[nameStartLower]})
                }
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
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(TypePicker)
