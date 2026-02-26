import React from 'react'
import PropTypes from 'prop-types'
import {
    TextField,
    FormControl,
    Menu,
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
    CardContent,
    Tooltip
} from 'ui/admin'
import {getImageTag, isValidImage, getImageSrc} from 'client/util/media'
import {convertRawValuesFromPicker} from 'client/util/picker'
import {queryStatemantForType} from 'util/types.mjs'
import {typeDataToLabel} from 'util/typesAdmin.mjs'
import config from 'gen/config-client'
import {getFormFieldsByFieldList} from '../../util/typesAdmin.mjs'

const {DEFAULT_LANGUAGE} = config
import {SimpleMenu, EditIcon} from 'ui/admin'
import {client} from '../middleware/graphql'
import Util from '../util/index.mjs'
import {csv2json} from '../../api/util/csv.mjs'
import Hook from '../../util/hook.cjs'
import GenericForm from './GenericForm'
import {openWindow} from '../util/window'
import {projectionToQueryString} from '../../util/project.mjs'
import styled from '@emotion/styled'
import {_t} from '../../util/i18n.mjs'
import FileDrop from './FileDrop'
import {propertyByPath} from "../util/json.mjs";

const StyledForm = styled(FormControl)(({fullWidth,theme})=>({
    display:'inline-flex',
    position: 'relative',
    zIndex: 'auto',
    width: fullWidth ? `calc(100% - ${theme.spacing(2)})` : 'auto',
    '> .MuiTextField-root':{
        margin:0,
        width: '100%'
    }
}))

const StyledChips = styled('div')(({ theme, isMulti }) => ({
    display: 'flex',
    width: '100%',
    flexWrap: 'wrap',
    marginTop: theme.spacing(1),
    marginBottom: isMulti?theme.spacing(1):0,
    marginLeft:isMulti?0:theme.spacing(1),
}))

const StyledChip = styled(Chip)(({isMulti,theme}) => ({
    marginRight:0,
    marginLeft:0,
    top: isMulti?0:theme.spacing(1),
    left: isMulti?0:theme.spacing(1),
    position: isMulti?'relative':'absolute',
}))

const StyledDropArea = styled('div')(({ theme }) => ({
    padding: '0',
    display:'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex:9999,
    writingMode: 'vertical-rl',
    width: `${theme.spacing(2)}`,
    margin: '0 0 -' + theme.spacing(2) + ' 0',
    opacity: 0,
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
            textValue: '',
            anchorEl:null
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
            state.showContextMenu !== this.state.showContextMenu ||
            state.anchorEl !== this.state.anchorEl ||
            state.hasFocus !== this.state.hasFocus ||
            props.error !== this.props.error ||
            state.selIdx !== this.state.selIdx
    }

    render() {
        const {inputProps, InputLabelProps, placeholder, multi, showAlwaysAsImage, fileImport, error, helperText, className, sx, fullWidth, linkTemplate, pickerField, metaFields, type, filter, label, genericType, readOnly} = this.props
        const {data, hasFocus, selIdx, value, textValue, showContextMenu} = this.state
        console.log(`render TypePicker | hasFocus=${hasFocus} | pickerField=${pickerField}`, data)
        const openTypeWindow = (value) => {
            let url
            if (linkTemplate) {
                url = Util.replacePlaceholders(linkTemplate, value)
            } else {
                const includeFields = ['info']
                if(pickerField){
                    (Array.isArray(pickerField)?pickerField:[pickerField]).forEach(field=>{
                        const base = field.split('.')[0]
                        if(includeFields.indexOf(base)<0){
                            includeFields.push(base)
                        }
                    })
                }
                url = `${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?opener=true&includeFields=${includeFields.join(',')}&multi=${!!multi}&fixType=${type}${genericType ? '&meta=' + genericType : ''}${filter ? '&baseFilter=' + encodeURIComponent(filter) : ''}${label ? '&title=' + encodeURIComponent(label) : ''}`
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
        const isEnabled = (!value.length || multi) && !readOnly

        return <StyledForm fullWidth={fullWidth} className={className} sx={sx}>
                <TextField error={error}
                           disabled={!isEnabled}
                           helperText={helperText}
                           value={textValue}
                           onChange={this.handleChange.bind(this)}
                           onKeyDown={this.handleKeyDown.bind(this)}
                           onFocus={(e) => this.setState({hasFocus: true, anchorEl:e.currentTarget})}
                           onBlur={this.handleBlur.bind(this)}
                           placeholder={placeholder}
                           label={label}
                           InputLabelProps={{
                               shrink: true,
                               ...InputLabelProps
                           }}
                           inputProps={inputProps}
                           InputProps={{
                               endAdornment: (
                                   <InputAdornment position="end">
                                       <IconButton
                                           disabled={!isEnabled}
                                           edge="end"
                                           onClick={() => {
                                               openTypeWindow()
                                           }}>
                                           <SearchIcon/>
                                       </IconButton>
                                       {value.length>1 && <Tooltip title={_t('TypePicker.deleteSelection')} key="tooltipDelete">
                                           <IconButton
                                               disabled={!isEnabled}
                                               edge="end"
                                               onClick={() => {
                                                   this.setState({value:[], textValue:''})
                                                   this.props.onChange({target: {value:[], name: this.props.name, dataset:this.props.dataset}})

                                               }}>
                                               <DeleteIcon/>
                                           </IconButton>
                                       </Tooltip>}
                                   </InputAdornment>
                               )
                           }}
                />

            <Menu anchorEl={this.state.anchorEl}
                    autoFocus={false}
                   disableAutoFocus      // prevents Menu from stealing focus
                   disableEnforceFocus   // allows focus to remain outside the Menu
                   disableRestoreFocus
                   PaperProps={{ style: { maxHeight: 300, margin:0 } }}
                   onClose={()=>{
                       this.setState({hasFocus:false})
                   }}
                   open={hasFocus && data && data.results && data.results.length > 0}>

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
                        {isValidImage(item) ? getImageTag(item, {size:'avatar',style:'margin-right:5px',height: 40}) : ''}
                        {typeDataToLabel(item, pickerField)}
                    </MenuItem>
                )}


            </Menu>

            {fileImport && fileImport.key && <FileDrop key="fileDrop"
                      multi={false}
                      style={{marginTop:'1rem'}}
                      accept={fileImport.accept || '*/*'}
                      maxSize={10000}
                      imagePreview={false}
                      onFileContent={(file,content) => {
                          try {
                              const jsonRaw = csv2json(content)

                              this.getData(`${fileImport.key}==[${jsonRaw.map(f=>f.id).join(',')}]`,{callback:({data,error})=>{
                                  if(data){
                                      const newValues = []
                                      jsonRaw.forEach(csvRow=>{
                                          const entry = data.results.find(f=>csvRow.id===propertyByPath(fileImport.key,f))
                                          if(entry) {
                                              delete csvRow.id
                                              newValues.push(Object.assign({}, entry, {metaValues: csvRow}))
                                          }
                                      })
                                      this.selectValue(newValues, true)
                                  }

                              },
                              limit:999})
                          }catch (e){
                              console.log(e)
                          }
                          /*const form = parentRef.createEditForm
                          form.setState({fields: {...form.state.fields, content:dataUrl}})*/
                      }}
                      label={fileImport.label || 'Drop file here'} />}
            {value && value.length>0 && <StyledChips isMulti={multi}>
                {value.map((singleValue, singleValueIndex) => {

                        const components = []

                        if (showAlwaysAsImage || isValidImage(singleValue, type)) {
                            components.push(<StyledImageChip
                                                 draggable={true}
                                                 data-index={singleValueIndex}
                                                 onDragStart={(e) => {
                                                     e.dataTransfer.setData('text', e.target.getAttribute('data-index'));
                                                 }}
                                                 onContextMenu={(e) => {
                                                     e.preventDefault()
                                                     this.setState({showContextMenu: {singleValue, left: e.clientX, top: e.clientY}})
                                                 }}
                                                 isMulti={multi}
                                                 key={singleValueIndex}>

                                <StyledDummyImage isMulti={multi}
                                     src={getImageSrc(singleValue,'thumbnail')}/>
                                <StyledDummyImageText>{typeDataToLabel(singleValue, pickerField)}</StyledDummyImageText>

                                {!readOnly && <StyledDummyButton sx={{left:'4px'}} edge="end"
                                                          onClick={this.handleRemovePick.bind(this, singleValueIndex)}>
                                    <DeleteIcon/>
                                </StyledDummyButton>}

                                <StyledDummyButton sx={{left:'40px'}} edge="end"
                                            onClick={() => {
                                                window.open(getImageSrc(singleValue,'full'), '_blank').focus()
                                            }}>
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
                                                                 name: this.props.name,
                                                                 dataset:this.props.dataset
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
                                components.push(<StyledChip isMulti={multi}
                                                      draggable={true}
                                                      data-index={singleValueIndex}
                                                      onDragStart={(e) => {
                                                          e.dataTransfer.setData('text', e.target.getAttribute('data-index'))
                                                      }}
                                                      key={singleValueIndex}
                                                      label={(multi && value.length > 1?(singleValueIndex+1) + '. ':'') +typeDataToLabel(singleValue, pickerField)}
                                                      onDelete={!readOnly && this.handleRemovePick.bind(this, singleValueIndex)}
                                                      onClick={() => {
                                                          if (singleValue.type === 'Media' || singleValue.__typename === 'Media') {
                                                              window.open(getImageSrc(singleValue,'full'), '_blank').focus()
                                                          } else {
                                                              openTypeWindow(singleValue)
                                                          }
                                                      }}
                                                      onContextMenu={(e) => {
                                                          e.preventDefault()
                                                          this.setState({showContextMenu: {singleValue, left: e.clientX, top: e.clientY}})
                                                      }}
                                                      avatar={isValidImage(singleValue) ?
                                                          <Avatar src={getImageSrc(singleValue, 'avatar')}/> : null}/>)
                            }
                        }

                        if(multi) {
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
                                                                this.props.onChange({
                                                                    target: {
                                                                        value: newValue,
                                                                        name: this.props.name,
                                                                        dataset: this.props.dataset
                                                                    }
                                                                })

                                                            }}
                                                            onDragOver={(e) => {
                                                                e.preventDefault()
                                                                e.dataTransfer.dropEffect = 'copy'
                                                                e.target.style.opacity = 1
                                                            }}
                                                            onDragLeave={(e) => {
                                                                e.target.style.opacity = 0
                                                            }}>Drop</StyledDropArea>)
                        }

                        return components

                    }
                )
                }
            </StyledChips>}
            {showContextMenu && <SimpleMenu open={showContextMenu}
                        anchorReference={"anchorPosition"}
                        anchorPosition={showContextMenu}
                        onClose={() => {
                            this.setState({
                                showContextMenu: false
                            })
                        }}
                        key="menu" noButton items={[
                {
                    name: _t('BaseLayout.editEntry'),
                    onClick: ()=>{
                        window.open(`/admin/types/${type}?open=${showContextMenu.singleValue._id}`)
                    },
                    icon: <EditIcon />
                }
            ]}/>}
        </StyledForm>
    }

    handleRemovePick(idx) {
        const value = this.state.value.slice(0)
        value.splice(idx, 1)

        this.setState({value, textValue:''})
        this.props.onChange({target: {value, name: this.props.name, dataset:this.props.dataset}})

    }

    handlePick(idx) {
        this.selectValue(this.state.data.results[idx])
    }


    selectValue(rawValue, replaceValue) {
        if (rawValue) {

            const {type, pickerField, name, queryFields, projection, onChange, multi, metaFields} = this.props

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
            if(metaFields) {
                fieldsToProject.push('metaValues')
            }
            let value = convertRawValuesFromPicker({type, fieldsToProject, rawValue, multi})

            if (multi && this.state.value && !replaceValue) {
                value = [...this.state.value,...value]
            }

            onChange({target: {value, name: name,dataset:this.props.dataset}, rawValue})


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
                this.getData(filter + (this.props.filter ? ' && ' + this.props.filter : ''), {})
            }, 250)
        }
    }

    handleBlur(e) {
        const {name, dataset, onChange, keepTextValue} = this.props
        const {value, textValue} = this.state

        if( (!value || !value.length) && keepTextValue){
            onChange({target: {value: textValue,name,dataset}})
        }

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
                e.preventDefault()
                this.handlePick(selIdx)
            }
        }
    }

    getData(filter, {callback, limit}) {

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

                queryString = projectionToQueryString(finalFields, type)

            } else {
                queryString = queryStatemantForType({type})
            }
            const variables = {filter, limit: limit || 20},
                gqlQuery = `query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results${queryString}}}`

            if(pickerSort){
                variables.sort = pickerSort
            }
            if(!callback) {
                const storeData = client.readQuery({
                    query: gqlQuery,
                    variables
                })
                if (storeData && storeData[nameStartLower]) {
                    // oh data are available in cache. show them first
                    this.setState({selIdx: 0, data: storeData[nameStartLower]})
                }
            }

            client.query({
                fetchPolicy: 'network-only',
                query: gqlQuery,
                variables
            }).then(response => {
                if(callback){
                    callback({data:response.data[nameStartLower]})
                }else {
                    if (this.pickTimeout === 0) {
                        this.setState({hasFocus: true, selIdx: 0, data: response.data[nameStartLower]})
                    }
                }
            }).catch(error => {
                if(callback){
                    callback({error})
                }else {
                    console.log(error.message)
                    this.setState({selIdx: 0, data: null})
                }
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
