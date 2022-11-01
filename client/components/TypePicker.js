import React from 'react'
import PropTypes from 'prop-types'
import {
    InputLabel,
    TextField,
    FormControl,
    Paper,
    MenuItem,
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
import {getImageTag, isValidImage, getImageSrc} from 'client/util/media'
import {convertRawValuesFromPicker} from 'client/util/picker'
import {queryStatemantForType} from 'util/types.mjs'
import {typeDataToLabel} from 'util/typesAdmin.mjs'
import config from 'gen/config-client'
import {getFormFieldsByFieldList} from '../../util/typesAdmin.mjs'

const {DEFAULT_LANGUAGE} = config

import {client} from '../middleware/graphql'
import Util from '../util/index.mjs'
import Hook from '../../util/hook.cjs'
import GenericForm from './GenericForm'
import {openWindow} from '../util/window'
import {projectionToQueryString} from '../../util/project.mjs'
import styled from '@emotion/styled'

const StyledForm = styled(FormControl)({
    position: 'relative',
    zIndex: 'auto',
    /*marginLeft: 0,*/
    minHeight: '69px'
})

const StyledSuggestions = styled(Paper)({
    position: 'absolute',
    zIndex: 999,
    top: '3rem',
    maxWidth: '100%'
})

const StyledChips = styled('div')(({ theme }) => ({
    display: 'flex',
    width: '100%',
    flexWrap: 'wrap',
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(0)
}))

const StyledChip = styled(Chip)(({ theme, isMulti }) => ({
    margin: theme.spacing(2) + ' 0px 0px ' + theme.spacing(1),
    '&:first-of-type': {
        marginLeft: 0
    },
    position: 'relative',
    ...(isMulti && {
        margin: theme.spacing(1) + ' 0',
        width: '15%',
        position: 'relative'
    }),
}))

const StyledDropArea = styled('div')(({ theme }) => ({
    textAlign: 'center',
    padding: '0.2rem',
    writingMode: 'vertical-rl',
    width: '1.6%',
    margin: '0 0 -' + theme.spacing(2) + ' 0',
    opacity: '0',
    fontSize: '0.8rem',
    backgroundColor: 'rgba(255,0,0,0.3)'
}))

const StyledImageChip = styled('div')(({ theme, isMulti }) => ({
    margin: theme.spacing(2) + ' 0px 0px ' + theme.spacing(1),
    '&:first-of-type': {
        marginLeft: 0
    },
    position: 'relative',
    ...(isMulti && {
        margin: theme.spacing(1) + ' 0',
        width: '15%',
        position: 'relative'
    }),
}))


const StyledDummyImage = styled('img')(({ isMulti }) => ({
    pointerEvents: 'none',
    maxWidth: '100%',
    maxHeight: '12rem',
    objectFit: 'cover',
    ...(isMulti && {
        maxWidth: 'none',
        width: '100%',
        maxHeight: '6rem'
    }),
}))

const StyledDummyImageText = styled('p')({
    pointerEvents: 'none',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
})

const StyledDummyButton = styled(IconButton)({
    position: 'absolute',
    top: '5px',
    zIndex: 2,
    margin: 0,
    padding: '0.2rem',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff'
})


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
        const {placeholder, multi, error, helperText, className, sx, fullWidth, linkTemplate, pickerField, metaFields, type, filter, label, genericType, readOnly} = this.props
        const {data, hasFocus, selIdx, value, textValue} = this.state
        console.log(`render TypePicker | hasFocus=${hasFocus} | pickerField=${pickerField}`, data)
        const openTypeWindow = (value) => {
            let url
            if (linkTemplate) {
                url = Util.replacePlaceholders(linkTemplate, value)
            } else {
                url = `${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?multi=${!!multi}&fixType=${type}${genericType ? '&meta=' + genericType : ''}${filter ? '&baseFilter=' + encodeURIComponent(filter) : ''}${label ? '&title=' + encodeURIComponent(label) : ''}`
                /*if(value && value._id){
                    url +='&prettyFilter='+JSON.stringify({_id:value._id})
                }*/
            }
            const newwindow = openWindow({url})
            if (!readOnly) {
                setTimeout(() => {
                    newwindow.addEventListener('beforeunload', (e) => {
                        this.selectValue(newwindow.resultValue)

                        delete e['returnValue']
                    })
                }, 500)
            }
        }
        return <StyledForm fullWidth={fullWidth} className={className} sx={sx}>
            {(!value.length || multi) && !readOnly ?
                <TextField error={error}
                           fullWidth={fullWidth}
                           sx={{margin:0}}
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
                /> : <InputLabel shrink>{label}</InputLabel>}

            <StyledSuggestions square>

                {hasFocus && data && data.results && data.results.map((item, idx) =>
                    <MenuItem
                        onClick={this.handlePick.bind(this, idx)}
                        selected={selIdx === idx}
                        key={idx}
                        component="div"
                        style={{
                            fontWeight: selIdx === idx ? 500 : 400,
                        }}
                    >
                        {isValidImage(item) ? getImageTag(item, {height: 30}) : ''}
                        {typeDataToLabel(item, pickerField)}
                    </MenuItem>
                )}


            </StyledSuggestions>
            <StyledChips>
                {value.map((singleValue, singleValueIndex) => {

                        const components = []

                        if (isValidImage(singleValue, type)) {
                            components.push(<StyledImageChip
                                                 draggable={true}
                                                 data-index={singleValueIndex}
                                                 onDragStart={(e) => {
                                                     e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                 }}
                                                 isMulti={multi}
                                                 key={singleValueIndex}>

                                <StyledDummyImage isMulti={multi}
                                     src={getImageSrc(singleValue)}/>
                                <StyledDummyImageText>{typeDataToLabel(singleValue, pickerField)}</StyledDummyImageText>

                                {!readOnly && <StyledDummyButton sx={{left:'4px'}} edge="end"
                                                          onClick={this.handleRemovePick.bind(this, singleValueIndex)}>
                                    <DeleteIcon/>
                                </StyledDummyButton>}

                                <StyledDummyButton sx={{left:'40px'}} edge="end"
                                            onClick={() => {
                                                window.open(getImageSrc(singleValue), '_blank').focus()
                                            }}
                                >
                                    <LaunchIcon/>
                                </StyledDummyButton>

                            </StyledImageChip>)
                        } else {
                            if (metaFields) {

                                components.push(<Card variant="outlined" key={'metaFields' + singleValueIndex}
                                                      draggable={true}
                                                      sx={{marginBottom: 3}}
                                                      data-index={singleValueIndex}
                                                      onDragStart={(e) => {
                                                          e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                      }}>
                                    <CardContent>
                                        {typeDataToLabel(singleValue, pickerField)}
                                        <GenericForm autoFocus
                                                     onBlur={event => {
                                                     }}
                                                     onChange={field => {

                                                         if (readOnly) {
                                                             return
                                                         }


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
                                        {!readOnly &&
                                        <IconButton onClick={this.handleRemovePick.bind(this, singleValueIndex)}>
                                            <DeleteIcon/>
                                        </IconButton>}
                                    </CardActions>
                                </Card>)

                            } else {
                                components.push(<StyledChip draggable={true}
                                                      data-index={singleValueIndex}
                                                      onDragStart={(e) => {
                                                          e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                      }}
                                                      key={singleValueIndex}
                                                      label={typeDataToLabel(singleValue, pickerField)}
                                                      onDelete={!readOnly && this.handleRemovePick.bind(this, singleValueIndex)}
                                                      onClick={() => {
                                                          if (singleValue.type === 'Media' || singleValue.__typename === 'Media') {
                                                              window.open(getImageSrc(singleValue), '_blank').focus()
                                                          } else {
                                                              openTypeWindow(singleValue)
                                                          }
                                                      }}
                                                      avatar={isValidImage(singleValue) ?
                                                          <Avatar src={getImageSrc(singleValue, {height: 30})}/> : null}/>)
                            }
                        }

                        components.push(<StyledDropArea key={'drop' + singleValueIndex}
                                             data-index={singleValueIndex}
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
                                             }}>Hier einfügen</StyledDropArea>)

                        return components

                    }
                )
                }
            </StyledChips>
        </StyledForm>
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

            const {type, pickerField, name, queryFields, projection, onChange, multi} = this.props

            let fieldsToProject

            if (projection) {
                fieldsToProject = projection.slice(0)
            } else {
                if (queryFields) {
                    fieldsToProject = queryFields.slice(0)
                } else if (pickerField) {
                    if (Array.isArray(pickerField)) {
                        fieldsToProject = pickerField.slice(0)
                    } else {
                        fieldsToProject = [pickerField]
                    }
                }

                // keep _id
                if (fieldsToProject && fieldsToProject.indexOf('_id') < 0) {
                    fieldsToProject.push('_id')
                }
            }


            if (!fieldsToProject) {
                fieldsToProject = []
            } else if (!Array.isArray(fieldsToProject)) {
                fieldsToProject = [fieldsToProject]
            }

            let value = convertRawValuesFromPicker({type, fieldsToProject, rawValue, multi})


            if (multi && this.state.value) {
                value = [...this.state.value,...value]
            }

            onChange({target: {value, name: name}, rawValue})


            this.setState({value, textValue: '', hastFocus: false, data: null})
        }
    }



    handleChange(e) {
        const value = e.target.value
        clearTimeout(this.pickTimeout)

        if (value === this.state.textValue) {
            // ignore nothing changed
        } else if (value === '') {
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
        const {type, queryFields, pickerField, pickerSort} = this.props
        if (type) {

            const nameStartLower = type.charAt(0).toLowerCase() + type.slice(1) + 's'
            let queryString


            if (queryFields || pickerField) {

                let finalFields
                if (queryFields) {
                    finalFields = queryFields.slice(0)
                } else if (Array.isArray(pickerField)) {
                    finalFields = pickerField.slice(0)
                } else {
                    finalFields = [pickerField]
                }

                Hook.call('TypePickerBeforeQueryString', {type, finalFields})

                queryString = projectionToQueryString(finalFields)

            } else {
                queryString = queryStatemantForType(type)
            }
            const variables = {filter, limit: 20},
                gqlQuery = `query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{_id __typename ${queryString}}}}`

            if(pickerSort){
                variables.sort = pickerSort
            }
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
    onChange: PropTypes.func.isRequired
}

export default TypePicker
