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
    LaunchIcon,
    Card,
    CardActions,
    CardContent
} from 'ui/admin'
import {getImageTag, getImageSrc} from 'client/util/media'
import {queryStatemantForType} from 'util/types'
import {typeDataToLabel} from 'util/typesAdmin'
import classNames from 'classnames'
import config from 'gen/config-client'
import {getFormFieldsByFieldList} from '../../util/typesAdmin'

const {DEFAULT_LANGUAGE} = config

import {client} from '../middleware/graphql'
import Util from '../util'
import Hook from '../../util/hook'
import GenericForm from './GenericForm'
import {openWindow} from '../util/window'
import {performFieldProjection, projectionToQueryString} from '../../util/project'

const styles = theme => {
    return {
        root: {
            position: 'relative',
            zIndex: 'auto',
            marginLeft: 0,
            minHeight: '69px'
        },
        suggestions: {
            position: 'absolute',
            zIndex: 999,
            top: '3rem',
            maxWidth: '100%'
        },
        clips: {
            display: 'flex',
            width: '100%',
            flexWrap: 'wrap',
            marginTop: theme.spacing(1),
            marginBottom: theme.spacing(0)
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
            textAlign:'center',
            padding: '0.2rem',
            writingMode: 'vertical-rl',
            width: '1.6%',
            margin: '0 0 -' + theme.spacing(2) + 'px 0',
            opacity: '0',
            fontSize: '0.8rem',
            backgroundColor: 'rgba(255,0,0,0.3)'
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
        const {classes, placeholder, multi, error, helperText, className, fullWidth, pickerField, metaFields, type, filter, label, genericType} = this.props
        const {data, hasFocus, selIdx, value, textValue} = this.state
        console.log(`render TypePicker | hasFocus=${hasFocus} | pickerField=${pickerField}`, data)
        const openTypeWindow = ()=>{

            const newwindow = openWindow({url:`${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/types/?noLayout=true&multi=${!!multi}&fixType=${type}${genericType?'&meta='+genericType:''}${filter ? '&baseFilter=' + encodeURIComponent(filter) : ''}${label ? '&title=' + encodeURIComponent(label) : ''}`})

            setTimeout(() => {
                newwindow.addEventListener('beforeunload', (e) => {
                    this.selectValue(newwindow.resultValue)

                    delete e['returnValue']
                })
            }, 500)
        }

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

                                               openTypeWindow()
                                           }}>
                                           <SearchIcon/>
                                       </IconButton>
                                   </InputAdornment>
                               ),
                           }}
                /> : <InputLabel className={classes.label} shrink>{label}</InputLabel>}

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
                    >{item.__typename === 'Media' && item.mimeType && item.mimeType.indexOf('image') === 0 ? getImageTag(item, {height: 30}) : ''} {
                        typeDataToLabel(item, pickerField)
                    }
                    </MenuItem>
                )}


            </Paper>
            <div className={classes.clips}>
                {value.map((singleValue, singleValueIndex) => {

                        const components = []

                        if (singleValue && singleValue.__typename === 'Media' && singleValue.mimeType && singleValue.mimeType.indexOf('image') === 0) {
                            components.push(<div draggable={true}
                                                 data-index={singleValueIndex}
                                                 onDragStart={(e) => {
                                                     e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                 }}
                                                 key={singleValueIndex}
                                                 className={classNames(classes.clip, multi && classes.clipMulti)}>
                                <img className={classNames(classes.dummyImg, multi && classes.dummyImgMulti)}
                                     src={getImageSrc(singleValue)}/>
                                <div className={classes.dummyTxt}>{typeDataToLabel(singleValue, pickerField)}</div>

                                <IconButton className={classes.dummyRemove}
                                            edge="end"
                                            onClick={this.handleRemovePick.bind(this, singleValueIndex)}
                                >
                                    <DeleteIcon/>
                                </IconButton>

                                <IconButton className={classes.openFile}
                                            edge="end"
                                            onClick={() => {
                                                window.open(getImageSrc(singleValue), '_blank').focus()
                                            }}
                                >
                                    <LaunchIcon/>
                                </IconButton>

                            </div>)
                        } else {
                            if (metaFields) {

                                components.push(<Card variant="outlined" key={'metaFields' + singleValueIndex}
                                                      draggable={true}
                                                      data-index={singleValueIndex}
                                                      onDragStart={(e) => {
                                                          e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                      }}>
                                    <CardContent>
                                        {typeDataToLabel(singleValue, pickerField)}
                                        <GenericForm autoFocus
                                                     innerRef={ref => {
                                                         //parentRef.createEditForm = ref
                                                     }}
                                                     onBlur={event => {
                                                     }}
                                                     onChange={field => {


                                                         const newValue = this.state.value.slice(0),
                                                             newSingleValue = Object.assign({}, newValue[singleValueIndex])

                                                         newSingleValue.metaValues = Object.assign({}, newSingleValue.metaValues)

                                                         newSingleValue.metaValues[field.name] = field.value

                                                         newValue[singleValueIndex] = newSingleValue

                                                         this.props.onChange({
                                                             target: {
                                                                 value: newValue,
                                                                 name: this.props.name
                                                             }
                                                         })
                                                         this.setState({
                                                             value: newValue,
                                                             textValue: '',
                                                             hastFocus: false,
                                                             data: null
                                                         })

                                                     }}
                                                     primaryButton={false}
                                                     values={singleValue.metaValues}
                                                     fields={getFormFieldsByFieldList(metaFields)}/>

                                    </CardContent>
                                    <CardActions disableSpacing>

                                        <IconButton onClick={this.handleRemovePick.bind(this, singleValueIndex)}>
                                            <DeleteIcon/>
                                        </IconButton>
                                    </CardActions>
                                </Card>)

                            } else {
                                components.push(<Chip draggable={true}
                                                      data-index={singleValueIndex}
                                                      onDragStart={(e) => {
                                                          e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                      }}
                                                      key={singleValueIndex}
                                                      className={classNames(classes.clip)}
                                                      label={typeDataToLabel(singleValue, pickerField)}
                                                      onDelete={this.handleRemovePick.bind(this, singleValueIndex)}
                                                      onClick={() => {
                                                          if (singleValue.type === 'Media' || singleValue.__typename=== 'Media') {
                                                              window.open(getImageSrc(singleValue), '_blank').focus()
                                                          }else {
                                                              openTypeWindow()
                                                          }
                                                      }}
                                                      avatar={singleValue && singleValue.__typename === 'Media' && singleValue.mimeType && singleValue.mimeType.indexOf('image') === 0 ?
                                                          <Avatar src={getImageSrc(singleValue, {height: 30})}/> : null}/>)
                            }
                        }

                        components.push(<div key={'drop' + singleValueIndex}
                                             data-index={singleValueIndex}
                                             className={classes.clipDrop}
                                             onDrop={(e) => {
                                                 const targetIndex = parseInt(e.currentTarget.getAttribute('data-index')) + 1,
                                                     sourceIndex = parseInt(e.dataTransfer.getData("text"))
                                                 e.target.style.opacity = 0

                                                 const newValue = this.state.value.slice(0),
                                                     element = newValue.splice(sourceIndex, 1) [0]

                                                 newValue.splice(targetIndex > sourceIndex ? targetIndex - 1 : targetIndex, 0, element)

                                                 this.setState({value: newValue})
                                                 this.props.onChange({target: {value: newValue, name: this.props.name}})

                                             }}
                                             onDragOver={(e) => {
                                                 e.preventDefault()
                                                 e.dataTransfer.dropEffect = 'copy'
                                                 e.target.style.opacity = 1
                                             }}
                                             onDragLeave={(e) => {
                                                 e.target.style.opacity = 0
                                             }}>Hier einfügen</div>)

                        return components

                    }
                )
                }
            </div>
        </FormControl>
    }

    handleRemovePick(idx) {
        const value = this.state.value.slice(0)
        value.splice(idx, 1)

        this.setState({value})
        this.props.onChange({target: {value, name: this.props.name}})

    }

    handlePick(idx) {
        this.selectValue(this.state.data.results[idx])
    }



    selectValue(rawValue) {
        if (rawValue) {

            const {type, pickerField, name, queryFields, projection, onChange} = this.props

            let fieldsToProject

            if(projection){
                fieldsToProject = projection.slice(0)
            }else{
                if (queryFields) {
                    fieldsToProject = queryFields.slice(0)
                } else if (pickerField) {
                    if(pickerField.constructor==Array) {
                        fieldsToProject = pickerField.slice(0)
                    }else{
                        fieldsToProject = [pickerField]
                    }
                }

                // keep _id
                if(fieldsToProject && fieldsToProject.indexOf('_id')<0){
                    fieldsToProject.push('_id')
                }
            }

            if(!fieldsToProject){
                fieldsToProject = []
            }else if (fieldsToProject.constructor !== Array) {
                fieldsToProject = [fieldsToProject]
            }


            Hook.call('TypePickerBeforeHandlePick', {type, pickerField, queryFields, fieldsToProject, projection, rawValue})



            //always remove creator
            delete rawValue.createdBy

            let projectedValue = rawValue

            if (fieldsToProject.length > 0) {


                projectedValue = performFieldProjection(fieldsToProject, rawValue)
            }

            Util.removeNullValues(projectedValue, {
                recursiv: true,
                emptyObject: true,
                emptyArray: true,
                nullArrayItems: true
            })

            let value = (this.state.value ? this.state.value.slice(0) : [])
            if (projectedValue.forEach) {
                projectedValue.forEach(itm => {
                    value.push({__typename: type, ...itm})
                })
            } else {
                value.push({__typename: type, ...projectedValue})
            }


            if(!this.props.multi) {
                // remove all items but last one
                value = value.slice(-1)
            }

            onChange({target: {value, name: name}, rawValue})
            this.setState({value, textValue: '', hastFocus: false, data: null})
        }
    }

    handleChange(e) {
        const value = e.target.value
        clearTimeout(this.pickTimeout)

        if( value===this.state.textValue){
            // ignore nothing changed
        }else if (value === '') {
            this.setState({data: null, textValue: value})
        } else {
            this.setState({textValue: value})


            this.pickTimeout = setTimeout(() => {
                clearTimeout(this.pickTimeout)

                const searchFields = this.props.searchFields ? this.props.searchFields.slice() : []


                Hook.call('TypePickerBeforeHandleChange', {
                    value,
                    searchFields,
                    type: this.props.type
                })


                let filter = ''
                if (searchFields.length > 0) {
                    searchFields.forEach(field => {
                        filter += field + '=' + value + ' '
                    })
                } else {
                    filter = value
                }

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
        const {type, queryFields, pickerField} = this.props
        if (type) {

            const nameStartLower = type.charAt(0).toLowerCase() + type.slice(1) + 's'
            let queryString


            if(queryFields || pickerField){

                let finalFields
                if(queryFields){
                    finalFields = queryFields.slice(0)
                }else if(pickerField.constructor === Array){
                    finalFields = pickerField.slice(0)
                }else{
                    finalFields = [pickerField]
                }

                Hook.call('TypePickerBeforeQueryString', {type, finalFields})

                queryString = projectionToQueryString(finalFields)

            } else {
                queryString = queryStatemantForType(type)
            }
            const variables = {filter, limit: 20},
                gqlQuery = `query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{_id __typename ${queryString}}}}`

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
    pickerField: PropTypes.string,
    queryFields: PropTypes.array,
    searchFields: PropTypes.array,
    metaFields: PropTypes.array,
    projection: PropTypes.array,
    placeholder: PropTypes.string,
    filter: PropTypes.string,
    error: PropTypes.bool,
    helperText: PropTypes.string,
    multi: PropTypes.bool,
    name: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(TypePicker)
