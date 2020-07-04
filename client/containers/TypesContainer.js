import React, {useState} from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import ManageCollectionClones from '../components/types/ManageCollectionClones'
import {
    withStyles,
    FileCopyIcon,
    DeleteIcon,
    EditIcon,
    Checkbox,
    Chip,
    Typography,
    Switch,
    SimpleSelect,
    TextField,
    SimpleDialog,
    SimpleTable,
    Row,
    Col,
    SimpleSwitch,
    SimpleMenu,
    AppBar,
    Button,
    Toolbar,
    IconButton,
    InputBase,
    SettingsIcon,
    Divider,
    Paper,
    ButtonGroup,
    ViewModuleIcon,
    ViewListIcon
} from 'ui/admin'
import {Query} from '@apollo/react-components'
import {withApollo} from '@apollo/react-hoc'
import {ApolloClient} from '@apollo/client'
import {gql} from '@apollo/client'
import Util from 'client/util'
import TypeEdit from 'client/components/types/TypeEdit'
import config from 'gen/config'
import Hook from 'util/hook'
import {
    getTypes,
    getTypeQueries,
} from 'util/types'
import {
    checkFieldType,
    getFormFields,
    typeDataToLabel,
    addAlwaysUpdateData
} from 'util/typesAdmin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {getImageTag} from 'client/util/media'
import {deepMerge} from 'util/deepMerge'
import DomUtil from 'client/util/dom'
import _t from 'util/i18n'

const {ADMIN_BASE_URL, LANGUAGES, DEFAULT_RESULT_LIMIT} = config
import {COLLECTIONS_QUERY} from '../constants'
import CodeEditor from "../components/CodeEditor";
import GenericForm from "../components/GenericForm";

const gqlCollectionsQuery = gql(COLLECTIONS_QUERY)

const styles = theme => ({
    textLight: {
        color: 'rgba(0,0,0,0.4)'
    },
    tableContent: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 150
    },
    tableLargeContent: {
        overflowX: 'hidden',
        overflowY: 'auto',
        maxWidth: 600,
        maxHeight: 200
    },
    script: {
        fontFamily: '"Courier 10 Pitch", Courier, monospace',
        fontSize: '85%'
    },
    searchRoot: {
        padding: '2px 4px',
        display: 'flex',
        alignItems: 'center',
        marginBottom: theme.spacing(2),
    },
    searchInput: {
        marginLeft: theme.spacing(1),
        flex: 1,
    },
    searchIconButton: {
        padding: 10,
    },
    searchDivider: {
        height: 28,
        margin: 4,
    },
    layoutChanger: {
        position: 'absolute',
        top: '5rem',
        right: '2rem'
    },
    nomargin: {
        margin: 0
    }
})


class TypesContainer extends React.Component {


    types = null
    pageParams = null
    createEditForm = null
    typesToSelect = []
    settings = {}
    fixType = null
    baseFilter = null
    noLayout = false

    constructor(props) {
        super(props)

        this.types = getTypes()
        this.parseSettings(props)

        this.pageParams = this.determinPageParams(props)
        this.baseFilter = props.baseFilter

        // store on object instance to preserve value when url change
        this.noLayout = this.pageParams.noLayout
        this.fixType = this.pageParams.fixType
        if (this.pageParams.baseFilter) {
            this.baseFilter = this.pageParams.baseFilter
        }
        this.state = {
            selectAllRows: false,
            selectedrows: {},
            confirmDeletionDialog: true,
            viewSettingDialog: undefined,
            viewFilterDialog: undefined,
            manageColDialog: undefined,
            confirmCloneColDialog: undefined,
            dataToDelete: null,
            dataToBulkEdit: null,
            createEditDialog: undefined,
            createEditDialogOption: null,
            dataToEdit: null,
            data: null,
            collectionName: '',
            simpleDialog: false,
            filter: this.pageParams.filter
        }

        if (!this.fixType) {
            // if it is not a fix type a selection box with all types is shown
            // prepare list with types for select box
            Object.keys(this.types).map((k) => {
                if (!this.settings[k] || !this.settings[k].hide) {
                    const t = this.types[k]
                    this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
                }
            })
        }
    }

    parseSettings(props) {
        this.settings = Object.assign({}, props.keyValueMap.TypesContainerSettings)
    }

    setSettingsForType(type, settings) {
        this.settings[type] = Object.assign({}, this.settings[type], settings)
        //TODO: make sure settings are saved
    }

    saveSettings() {
        const value = JSON.stringify(this.settings)
        if (value !== JSON.stringify(this.props.keyValueMap.TypesContainerSettings)) {
            console.log('save settings', value)
            this.props.setKeyValue({key: 'TypesContainerSettings', value})
        }
    }


    componentDidMount() {
        this.getData(this.pageParams, true)
        if (this.props.onRef)
            this.props.onRef(this)

        this._handleWindowClose = this.saveSettings.bind(this)
        window.addEventListener('beforeunload', this._handleWindowClose)
    }

    componentWillUnmount() {
        setTimeout(() => {
            this.saveSettings()
        }, 1)
        window.removeEventListener('beforeunload', this._handleWindowClose)
    }


    shouldComponentUpdate(props, state) {
        const settingsChanged = this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings
        const pageParams = this.determinPageParams(props),
            typeChanged = this.pageParams.type !== pageParams.type

        if (settingsChanged) {
            this.parseSettings(props)
        }
        if (/*settingsChanged ||*/
            this.props.settings !== props.settings ||
            this.props.baseFilter !== props.baseFilter ||
            this.pageParams.page !== pageParams.page ||
            typeChanged ||
            this.pageParams._version !== pageParams._version ||
            this.pageParams.limit !== pageParams.limit ||
            this.pageParams.sort !== pageParams.sort ||
            this.pageParams.layout !== pageParams.layout ||
            this.pageParams.filter !== pageParams.filter) {

            this.pageParams = pageParams
            if (props.baseFilter) {
                this.baseFilter = props.baseFilter
            }
            this.getData(pageParams, true, typeChanged)

            return false
        }

        return this.state !== state ||
            this.state.data !== state.data ||
            this.state.filter !== state.filter ||
            this.state.selectedrows !== state.selectedrows ||
            this.props.location !== props.location ||
            this.props.baseFilter !== props.baseFilter ||
            settingsChanged
    }

    renderTable(columns) {
        if (this._renderedTable) {
            return this._renderedTable
        }
        const {classes, client} = this.props
        const {data, selectedrows} = this.state
        if (data) {

            const {type, page, limit, sort, _version} = this.pageParams
            const fields = this.types[type].fields, dataSource = []

            const columnsFiltered = [], columnsMap = {}

            // filter: Show only the cols that are marked as active
            columns.forEach((col) => {
                columnsMap[col.id] = this.isColumnActive(type, col.id)
                if (columnsMap[col.id]) {
                    columnsFiltered.push(col)
                }
            })

            if (data.results) {
                data.results.forEach(item => {
                    if (!item) return
                    const dynamic = {}

                    if (columnsMap['check']) {
                        // add a checkbox to the first column
                        dynamic.check = <Checkbox
                            checked={!!selectedrows[item._id]}
                            onChange={this.handleRowSelect.bind(this)}
                            value={item._id}
                        />
                    }

                    fields.forEach(field => {
                        if (columnsMap[field.name]) {
                            let fieldValue = item[field.name]
                            if (field.reference) {
                                if (fieldValue) {
                                    if (fieldValue.constructor === Array) {
                                        if (field.type === 'Media') {
                                            dynamic[field.name] = fieldValue.reduce((s, i) => {
                                                s.push(getImageTag(i, {key: i._id, height: 40}))
                                                return s
                                            }, [])
                                        } else {
                                            dynamic[field.name] = fieldValue.reduce((s, i) => {
                                                if (i) {
                                                    return s + (s !== '' ? ', ' : '') + typeDataToLabel(i, field.pickerField)
                                                } else {
                                                    return 'Broken reference?'
                                                }
                                            }, '')
                                        }


                                    } else {
                                        if (field.type === 'Media') {
                                            dynamic[field.name] = getImageTag(fieldValue, {height: 40})
                                        } else {
                                            if (field.fields) {
                                                let str = ''
                                                field.fields.forEach(f => {
                                                    if (str) str += ', '
                                                    str += fieldValue[f]
                                                })
                                                dynamic[field.name] = str
                                            } else {
                                                dynamic[field.name] = typeDataToLabel(fieldValue, field.pickerField)
                                            }
                                        }
                                    }
                                }
                            } else if (field.type === 'Boolean') {
                                dynamic[field.name] = <Switch name={field.name}
                                                              onChange={e => this.handleDataChange.bind(this)(e, item, field)}
                                                              checked={!!fieldValue}/>
                            } else if (field.uitype === 'image') {
                                dynamic[field.name] =
                                    <img style={{height: '40px'}}
                                         src={fieldValue}/>
                            } else if (['json', 'editor', 'jseditor'].indexOf(field.uitype) >= 0) {
                                if (fieldValue && fieldValue.length > 50) {
                                    dynamic[field.name] = <span
                                        className={classes.script}>{fieldValue.substring(0, 20) + '...' + fieldValue.substring(fieldValue.length - 20)}</span>
                                } else {
                                    dynamic[field.name] = <span className={classes.script}>{fieldValue}</span>
                                }
                            } else if (field.uitype === 'datetime') {
                                dynamic[field.name] = Util.formattedDatetime(fieldValue)
                            } else if (field.uitype === 'password') {
                                dynamic[field.name] = '••••••'
                            } else {
                                if (field.localized) {
                                    const langVar = []

                                    LANGUAGES.map(lang => {
                                        langVar.push(<div key={lang} className={classes.tableContent}>
                                        <span
                                            className={classes.textLight}>{lang}:</span> <span
                                            onBlur={e => this.handleDataChange.bind(this)(e, item, field, lang)}
                                            suppressContentEditableWarning
                                            dangerouslySetInnerHTML={{
                                                __html: fieldValue && fieldValue[lang]
                                            }}
                                            contentEditable/>
                                            <br/>
                                        </div>)
                                    })
                                    dynamic[field.name] = langVar
                                } else {
                                    if (fieldValue && fieldValue.constructor === Array) {
                                        dynamic[field.name] = fieldValue.map(e => <Chip key={e} label={e}/>)
                                    } else {
                                        dynamic[field.name] =
                                            <div className={classes.tableLargeContent}
                                                 onBlur={e => this.handleDataChange.bind(this)(e, item, field)}
                                                 suppressContentEditableWarning contentEditable
                                                 dangerouslySetInnerHTML={{
                                                     __html: fieldValue
                                                 }}/>
                                    }
                                }


                            }
                        }
                    })

                    if (columnsMap['_user']) {
                        dynamic._user = (item.createdBy ? item.createdBy.username : '???')
                    }
                    if (columnsMap['modifiedAt']) {
                        dynamic.modifiedAt = (item.modifiedAt ? Util.formattedDatetime(item.modifiedAt) : '')
                    }
                    if (columnsMap['date']) {
                        dynamic.date = <span><span>{Util.formattedDateFromObjectId(item._id)}</span><br/><small>{item._id}</small></span>
                    }
                    if (columnsMap['_action']) {

                        const entryActions = [{
                            name: _t('TypesContainer.deleteEntry'),
                            disabled: (item.status == 'deleting' || item.status == 'updating'),
                            onClick: this.handleDeleteDataClick.bind(this, item),
                            icon: <DeleteIcon/>
                        }, {
                            name: _t('TypesContainer.editEntry'),
                            disabled: (item.status == 'deleting' || item.status == 'updating'),
                            onClick: this.handleEditDataClick.bind(this, item),
                            icon: <EditIcon/>
                        }]

                        if (this.types[type].entryClonable) {
                            entryActions.push(
                                {
                                    name: _t('TypesContainer.cloneEntry'),
                                    disabled: (item.status == 'deleting' || item.status == 'updating'),
                                    onClick: this.handleCopyClick.bind(this, item, fields),
                                    icon: <FileCopyIcon/>
                                })
                        }
                        Hook.call('TypeTableEntryAction', {type, actions: entryActions, item, container: this})

                        dynamic._action = <SimpleMenu mini items={entryActions}/>

                    }
                    dataSource.push(dynamic)
                })
            }
            const asort = sort.split(' ')

            /* HOOK */
            Hook.call('TypeTable', {type, dataSource, data, fields, container: this})

            const selectedLength = Object.keys(this.state.selectedrows).length
            const actions = [
                {
                    name: _t('TypesContainer.addNew', {type}), onClick: () => {
                        setTimeout(() => {
                            this.setState({createEditDialog: true})
                        }, 0)

                    }
                },
                {
                    name: 'Export', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                title: 'Export',
                                children: <textarea style={{
                                    width: '20rem',
                                    height: '20rem'
                                }}>{JSON.stringify(this.state.data.results, null, 2)}</textarea>
                            }
                        })
                    }
                },
                {
                    name: 'Import', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                title: 'Import',
                                actions: [{key: 'import', label: 'Import'}],
                                onClose: (e) => {
                                    if (e.key === 'import') {
                                        client.query({
                                            fetchPolicy: 'network-only',
                                            query: gql`query importCollection($collection: String!, $json: String!){importCollection(collection:$collection,json:$json){result}}`,
                                            variables: {
                                                collection: type,
                                                json: document.getElementById('importData').value
                                            }
                                        }).then(response => {
                                            this.setState({simpleDialog: {children: JSON.stringify(response.data.importCollection)}})
                                        })
                                    } else {
                                        this.setState({simpleDialog: false})
                                    }
                                },
                                children: <textarea id="importData"
                                                    style={{width: '20rem', height: '20rem'}}></textarea>
                            }
                        })
                    }
                },
                {
                    name: 'View settings', onClick: () => {
                        this.setState({viewSettingDialog: true})
                    }
                },
                {
                    name: 'Refresh', onClick: () => {
                        this.getData(this.pageParams, false)
                    }
                }]

            if (this.types[type].collectionClonable) {
                actions.push({
                    name: 'Create new version', onClick: () => {
                        this.setState({confirmCloneColDialog: true})
                    }
                })
                actions.push({
                    name: 'Manage versions', onClick: () => {
                        this.setState({manageColDialog: true})
                    }
                })
            }

            Hook.call('TypeTableAction', {type, actions}, this)

            this._renderedTable =
                <SimpleTable key="typeTable"
                             style={{marginBottom: window.opener && selectedLength > 0 && this.pageParams.multi === 'true' ? '5rem' : ''}}
                             title={type}
                             onRowClick={this.handleRowClick.bind(this)}
                             dataSource={dataSource}
                             columns={columnsFiltered}
                             count={data.total}
                             rowsPerPage={limit} page={page}
                             orderBy={asort[0]}
                             header={this.types[type].collectionClonable &&
                             <Query query={gqlCollectionsQuery}
                                    fetchPolicy="cache-and-network"
                                    variables={{filter: '^' + type + '_.*'}}>
                                 {({loading, error, data}) => {
                                     if (loading) return 'Loading...'
                                     if (error) return `Error! ${error.message}`

                                     if (!data.collections.results) return null

                                     const items = data.collections.results.reduce((a, c) => {
                                         const value = c.name.substring(c.name.indexOf('_') + 1)
                                         let date, name = 'no name'

                                         if (value.indexOf('_') >= 0) {
                                             date = value.substring(0, value.indexOf('_'))
                                             name = value.substring(value.indexOf('_') + 1).replace('_', ' ')
                                         } else {
                                             date = value
                                         }

                                         a.push({
                                             value,
                                             name: Util.formattedDatetime(date) + (name ? ' - ' + name : '')
                                         })
                                         return a
                                     }, [])
                                     items.unshift({value: 'default', name: 'Default'})
                                     return <SimpleSelect
                                         label="Select version to edit"
                                         value={_version}
                                         onChange={(e) => {
                                             const {type} = this.pageParams
                                             this.goTo({_version: e.target.value})
                                             this.setSettingsForType(type, {_version: e.target.value})
                                         }}
                                         items={items}
                                     />
                                 }}
                             </Query>
                             }
                             actions={actions}
                             footer={<div style={{display: 'flex', alignItems: 'center'}}><p
                                 style={{marginRight: '2rem'}}>{`${selectedLength} rows selected`}</p>{selectedLength ?
                                 <SimpleSelect
                                     label="Select action"
                                     value=""
                                     onChange={this.handleBatchAction.bind(this)}
                                     items={[{name: 'Delete', value: 'delete'}, {name: 'Bulk edit', value: 'edit'}]}
                                 /> : ''}</div>}
                             orderDirection={asort.length > 1 && asort[1] || null}
                             onSort={this.handleSortChange}
                             onChangePage={this.handleChangePage.bind(this)}
                             onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>

            return this._renderedTable
        }

        return null
    }


    render() {
        const startTime = new Date()
        const {simpleDialog, dataToEdit, createEditDialog, viewSettingDialog, viewFilterDialog, confirmCloneColDialog, manageColDialog, dataToDelete, dataToBulkEdit, confirmDeletionDialog} = this.state
        const {title, client, classes} = this.props
        const {type} = this.pageParams
        const formFields = getFormFields(type), columns = this.getTableColumns(type)

        if (!this.types[type]) {
            return <BaseLayout><Typography variant="subtitle1" color="error">Type {type} does not
                exist.
                Types can be specified in an extension. Please select another type.</Typography><SimpleSelect
                value={type}
                onChange={this.handleTypeChange}
                items={this.typesToSelect}
            /></BaseLayout>
        }


        let viewSettingDialogProps, editDialogProps, manageColDialogProps, viewFilterDialogProps

        if (viewFilterDialog !== undefined) {

            const formFields = getFormFields(type), activeFormFields = {}


            columns.map(c => {
                if (formFields[c.id] && this.isColumnActive(type, c.id)) {
                    activeFormFields[c.id] = Object.assign({}, formFields[c.id])
                    activeFormFields[c.id].fullWidth = true
                    delete activeFormFields[c.id].tab
                    delete activeFormFields[c.id].required
                }
            })

            let formRef
            viewFilterDialogProps = {
                title: 'Filter',
                open: this.state.viewFilterDialog,
                onClose: () => {
                    let newFilter = ''
                    Object.keys(formRef.state.fields).forEach(fieldKey => {
                        const value = formRef.state.fields[fieldKey]
                        if (value) {
                            if (newFilter) {
                                newFilter += ' && '
                            }

                            if (value.constructor === String) {
                                newFilter += `${fieldKey}=${value}`
                            } else {
                                let ids = []
                                value.forEach(item => {
                                    ids.push(item._id)
                                })
                                newFilter += `${fieldKey}=[${ids.join(',')}]`
                            }

                        }
                    })
                    this.setState({viewFilterDialog: false, filter: newFilter}, () => {
                        this.handleFilter({value: newFilter}, true)
                    })

                },
                actions: [{
                    key: 'ok',
                    label: 'Ok',
                    type: 'primary'
                }],
                children: <div>
                    <GenericForm primaryButton={false} ref={(e) => {
                        formRef = e
                    }} fields={activeFormFields}/>
                </div>
            }
        }

        if (viewSettingDialog !== undefined) {
            viewSettingDialogProps = {
                title: 'View settings',
                open: this.state.viewSettingDialog,
                onClose: this.handleViewSettingClose,
                actions: [{
                    key: 'ok',
                    label: 'Ok',
                    type: 'primary'
                }],
                children: <div>
                    <Typography variant="subtitle1" component="h2" gutterBottom>Available columns</Typography>

                    {columns &&
                    columns.map(c => {
                        return <div key={c.id}><SimpleSwitch disabled={!!this.props.settings}
                                                             label={c.label || c.title} name={c.id}
                                                             onChange={(e) => {
                                                                 this.handleViewSettingChange.bind(this)(e, type)
                                                             }}
                                                             checked={this.isColumnActive(type, c.id)}/></div>
                    })
                    }
                </div>
            }
        }

        if (createEditDialog !== undefined) {
            editDialogProps = {
                client,
                type,
                title: type,
                open: createEditDialog,
                onClose: this.handleCreateEditData.bind(this),
                updateData: this.updateData.bind(this),
                createData: this.createData.bind(this),
                dataToEdit,
                meta: {_this: this, option: this.state.createEditDialogOption, ...this.pageParams}
            }
        }

        if (manageColDialog !== undefined) {
            manageColDialogProps = {
                title: 'Manage versions',
                fullScreen: true,
                open: this.state.manageColDialog,
                onClose: this.handleViewCollectionClose,
                actions: [{
                    key: 'ok',
                    label: 'Ok',
                    type: 'primary'
                }],
                children: <ManageCollectionClones type={type}/>
            }
        }

        const selectedLength = Object.keys(this.state.selectedrows).length
        const {description} = this.types[type]
        const content = [
            title === false ? '' :
                <Typography key="typeTitle" variant="h3"
                            gutterBottom>{title || (this.fixType ? this.fixType : 'Types')}</Typography>,
            description ?
                <Typography key="typeDescription" variant="subtitle1" gutterBottom>{description}</Typography> : '',
            <ButtonGroup size="small" key="layoutChanger" className={classes.layoutChanger} disableElevation
                         variant="contained" color="primary">
                <Button onClick={() => {
                    this.setSettingsForType(this.pageParams.type, {layout: 'list'})
                    this.goTo({layout: 'list'})
                }} variant={this.pageParams.layout === 'list' ? 'outlined' : ''}
                        className={classes.nomargin}><ViewListIcon/></Button>
                <Button onClick={() => {
                    this.setSettingsForType(this.pageParams.type, {layout: 'module'})
                    this.goTo({layout: 'module'})
                }} variant={this.pageParams.layout === 'module' ? 'outlined' : ''}
                        className={classes.nomargin}><ViewModuleIcon/></Button>
            </ButtonGroup>,
            <Row spacing={2} key="typeHeader">
                {!this.fixType &&
                <Col md={6}>
                    <SimpleSelect
                        value={type}
                        onChange={this.handleTypeChange}
                        items={this.typesToSelect}
                    />
                </Col>
                }
                <Col xs={12} md={(this.fixType ? 12 : 6)} align="right">

                    <Paper elevation={1} component="form" className={classes.searchRoot}>
                        <InputBase
                            value={this.state.filter}
                            onChange={(e) => {
                                this.setState({filter: e.target.value})
                                this.handleFilter({value: e.target.value, target: e.target}, false)
                            }}
                            onKeyDown={(e) => {
                                this.handelFilterKeyDown(e, e.target.value)
                            }}
                            className={classes.searchInput}
                            placeholder={_t('TypesContainer.filter')}
                        />
                        <IconButton onClick={() => {
                            this.setState({filter: ''})

                            this.handleFilter({value: ''}, true)
                        }} className={classes.searchIconButton}>
                            <DeleteIcon/>
                        </IconButton>
                        <Divider className={classes.searchDivider} orientation="vertical"/>
                        <IconButton color="primary"
                                    onClick={() => {
                                        this.setState({viewFilterDialog: true})
                                    }}
                                    className={classes.searchIconButton}>
                            <SettingsIcon/>
                        </IconButton>
                    </Paper>

                </Col>
            </Row>,
            this.renderTable(columns),
            dataToDelete &&
            <SimpleDialog key="deleteDialog" open={confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                          title="Confirm deletion">
                Are you sure you want to delete {dataToDelete.length > 1 ? 'the selected items' : 'this item'}?
            </SimpleDialog>,
            dataToBulkEdit &&
            <SimpleDialog fullWidth={true}
                          maxWidth="md"
                          key="bulkeditDialog"
                          open={true}
                          onClose={(action) => {
                              if (action.key === 'execute') {

                                  const script = this.state.bulkEditScript || this.props.keyValueMap.TypesContainerBulkEdit
                                  this.props.setKeyValue({key: 'TypesContainerBulkEdit', value: script})

                                  client.query({
                                      fetchPolicy: 'network-only',
                                      query: gql`query bulkEdit($collection:String!,$_id:[ID]!,$script:String!){bulkEdit(collection:$collection,_id:$_id,script:$script){result}}`,
                                      variables: {
                                          collection: type,
                                          _id: dataToBulkEdit,
                                          script
                                      }
                                  }).then(response => {
                                      if (response.data.bulkEdit) {
                                          this.setState({simpleDialog: {children: JSON.stringify(response.data.bulkEdit)}})
                                      }
                                  })


                              } else {
                                  this.setState({dataToBulkEdit: false})
                              }
                          }}
                          actions={[{key: 'execute', label: 'Execute'}, {
                              key: 'cancel',
                              label: 'Cancel',
                              type: 'primary'
                          }]}
                          title="Bulk edit">

                <CodeEditor lineNumbers
                            type="js"
                            onBlur={(e, bulkEditScript) => {
                                console.log(bulkEditScript)
                                this.setState({bulkEditScript})
                            }}>{this.props.keyValueMap.TypesContainerBulkEdit}</CodeEditor>

            </SimpleDialog>,
            confirmCloneColDialog !== undefined &&
            <SimpleDialog key="confirmClonCol" open={confirmCloneColDialog} onClose={this.handleCloneClollection}
                          actions={[{key: 'cancel', label: 'Cancel'}, {
                              key: 'create',
                              label: 'Create',
                              type: 'primary'
                          }]}
                          title={'Create new version: ' + type}>
                <TextField value={this.state.collectionName} onChange={(e) => {
                    this.setState({collectionName: e.target.value})
                }} placeholder="Enter a name (optional)"/>
            </SimpleDialog>,
            simpleDialog &&
            <SimpleDialog key="simpleDialog" open={!!simpleDialog} onClose={simpleDialog.onClose || (() => {
                this.setState({simpleDialog: false})
            })}
                          actions={simpleDialog.actions || [{key: 'ok', label: 'OK'}]}
                          title={simpleDialog.title || 'Message'}>
                {simpleDialog.children}
            </SimpleDialog>,
            createEditDialog !== undefined && <TypeEdit key="editDialog" {...editDialogProps}/>,
            viewSettingDialog !== undefined && <SimpleDialog key="settingDialog" {...viewSettingDialogProps}/>,
            viewFilterDialog !== undefined && <SimpleDialog key="settingDialog" {...viewFilterDialogProps}/>,
            manageColDialog !== undefined && <SimpleDialog key="collectionDialog" {...manageColDialogProps}/>,
            window.opener && selectedLength > 0 &&
            <AppBar key="appbar" position="fixed" color="primary" style={{
                top: 'auto',
                bottom: 0
            }}>
                <Toolbar>
                    <Button color="secondary" variant="contained"
                            onClick={() => {
                                const items = []


                                this.state.data.results.forEach(item => {
                                    if (this.state.selectedrows[item._id]) {
                                        items.push(item)
                                    }
                                })

                                if (this.pageParams.multi !== 'true') {
                                    items.splice(1)
                                }

                                window.resultValue = items
                                window.close()

                            }}>Auswahl übernehmen</Button>
                </Toolbar>
            </AppBar>
        ]

        Hook.call('TypesContainerRender', {type, content}, this)

        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        if (this.noLayout) {
            return content
        }
        return <BaseLayout>{content}</BaseLayout>
    }

    isColumnActive(type, id) {
        const {settings} = this.props
        let s
        if (settings && settings[type]) {
            // check settings from props if available
            s = settings[type]
            return settings[type].columns[id] === undefined || settings[type].columns[id]
        } else {
            s = this.settings[type]
        }

        if (s && s.columns) {
            return s.columns[id] === undefined || s.columns[id]
        }
        return true
    }


    handleRowClick(event, index) {
        const {type} = this.pageParams
        const {data} = this.state

        const item = data.results[index]
        if (event.detail === 2) {
            event.preventDefault()
            event.stopPropagation()
            // it was a double click
            if (window.opener) {
                window.resultValue = item
                window.close()
            } else {

                this.handleEditDataClick(item)
            }
        } else {

            Hook.call('TypeTableEntryClick', {type, event, item, container: this})
        }
    }


    handleBatchAction(e) {
        const value = e.target.value
        if (value === 'delete') {
            const dataToDelete = []
            Object.keys(this.state.selectedrows).forEach(_id => {
                dataToDelete.push({_id})
            })
            this.setState({dataToDelete, confirmDeletionDialog: true})

        } else if (value === 'edit') {
            const dataToBulkEdit = []
            Object.keys(this.state.selectedrows).forEach(_id => {
                dataToBulkEdit.push(_id)
            })
            this.setState({dataToBulkEdit})
        }
    }


    handleRowSelect(e) {
        const target = e.target, checked = target.checked, value = target.value
        const selectedrows = Object.assign({}, this.state.selectedrows)

        const update = (value) => {
            if (checked) {
                selectedrows[value] = checked
            } else {
                delete selectedrows[value]
            }
        }
        let selectAllRows = false
        if (value === '') {
            const {data} = this.state
            selectAllRows = checked
            if (data.results) {
                data.results.forEach(item => {
                    if (item) {
                        update(item._id)
                    }
                })
            }
        } else {
            update(value)
        }
        this._renderedTable = null
        this.setState({selectedrows, selectAllRows})

    }

    handleViewSettingChange(e, type) {
        const target = e.target, value = target.checked, name = target.name
        this.settings = deepMerge(this.settings, {[type]: {columns: {[name]: value}}})
        // force rerendering
        this.forceUpdate()
    }


    getTableColumns(type) {
        const typeDefinition = this.types[type]
        if (!typeDefinition) return

        const {selectAllRows} = this.state

        const typeColumns = []

        typeColumns.push({
            label: 'Check',
            title: <Checkbox
                value=""
                checked={this.state.selectAllRows}
                onChange={this.handleRowSelect.bind(this)}
            />,
            id: 'check'
        })

        typeDefinition.fields.forEach(field => {
            if (!field.hidden && field.name !== 'createdBy') {
                typeColumns.push({
                    title: _t(`${type}.field.${field.name}`, null, (field.label || field.name) + (field.localized ? ' [' + _app_.lang + ']' : '')),
                    id: field.name,
                    sortable: true
                })
            }
        })

        if (!typeDefinition.noUserRelation) {
            typeColumns.push({
                title: _t('TypesContainer.user'),
                id: '_user',
                sortid: 'createdBy',
                sortable: true
            })
        }
        typeColumns.push(
            {
                title: _t('TypesContainer.createdAt'),
                id: 'date',
                sortid: '_id',
                sortable: true
            },
            {
                title: _t('TypesContainer.actions'),
                id: '_action'
            })

        /* HOOK */
        Hook.call('TypeTableColumns', {type, _version: this.pageParams._version, columns: typeColumns})

        return typeColumns
    }

    determinPageParams(props) {
        const {params} = props.match
        const {p, l, s, f, v, noLayout, fixType, baseFilter, multi, layout} = Util.extractQueryParams(window.location.search.substring(1))
        const pInt = parseInt(p), lInt = parseInt(l)

        const finalFixType = fixType || props.fixType,
            finalNoLayout = noLayout === 'true' ? true : noLayout === 'false' ? false : props.noLayout

        let type
        if (finalFixType) {
            type = finalFixType
        } else if (params.type) {
            type = params.type
        } else if (this.settings.lastType) {
            type = this.settings.lastType
        } else {
            for (const prop in this.types) {
                type = prop
                break
            }
        }
        const typeSettings = this.settings[type] || {}
        const result = {
            baseFilter,
            multi,
            fixType: finalFixType,
            noLayout: finalNoLayout,
            limit: lInt || typeSettings.limit || DEFAULT_RESULT_LIMIT,
            page: pInt || typeSettings.page || 1,
            sort: s || typeSettings.sort || '',
            filter: f || typeSettings.filter || '',
            layout: layout || typeSettings.layout || 'list',
            _version: v || typeSettings._version || 'default'
        }
        result.type = type
        return result
    }

    getStoreKey(type) {
        return type.charAt(0).toLowerCase() + type.slice(1) + 's'
    }

    enhanceOptimisticData(o) {
        const formFields = getFormFields(this.pageParams.type)
        for (let k in o) {
            if (o[k] && formFields[k] && formFields[k].localized) {
                o[k] = {...o[k], __typename: 'LocalizedString'}
            }
        }
    }

    extendFilter(filter) {
        return filter + (this.baseFilter ? (filter ? ' && ' : '') + this.baseFilter : '')
    }

    getData({type, page, limit, sort, filter, _version}, cacheFirst, typeChanged) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            if (queries) {
                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, _version, filter: this.extendFilter(filter)},
                    gqlQuery = gql(queries.query)
                if (cacheFirst) {
                    try {
                        const storeData = client.readQuery({
                            query: gqlQuery,
                            variables
                        })
                        if (storeData && storeData[storeKey]) {
                            // oh data are available in cache. show them first
                            setTimeout(() => {

                                this._renderedTable = null
                                const newState = {data: storeData[storeKey]}

                                if (typeChanged) {
                                    newState.filter = filter
                                }
                                this.setState(newState)
                            }, 0)
                        }
                    } catch (e) {
                    }
                }
                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    query: gqlQuery,
                    variables
                }).then(response => {
                    const o = response.data[storeKey]
                    this._renderedTable = null
                    const newState = {data: o}

                    if (typeChanged) {
                        newState.filter = filter
                    }
                    this.setState(newState)

                }).catch(error => {
                    console.log(error.message)
                    this._renderedTable = null
                    this.setState({data: null})
                })

            }
        }
    }

    createData(input, optimisticInput, {type, page, limit, sort, filter, _version}) {
        const {client, user} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            return client.mutate({
                mutation: gql(queries.create),
                variables: {
                    _version,
                    ...input
                },
                update: (store, {data}) => {

                    const freshData = {
                        ...data['create' + type],
                        createdBy: {
                            _id: user.userData._id,
                            username: user.userData.username,
                            __typename: 'UserPublic'
                        }, ...optimisticInput
                    }
                    this.enhanceOptimisticData(freshData)

                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type)
                    const extendedFilter = this.extendFilter(filter)

                    const variables = {page, limit, sort, _version, filter: extendedFilter}

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables
                    })
                    if (storeData[storeKey]) {
                        const newData = {...storeData[storeKey], results: [...storeData[storeKey].results]}

                        if (freshData) {
                            newData.results.unshift(freshData)
                            newData.total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })
                        this._renderedTable = null
                        this.setState({data: newData})
                    }

                },
            })
        }
    }

    updateData(changedData, optimisticData, {type, page, limit, sort, filter, _version}) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            return client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: {_version, ...changedData},
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type),
                        responseItem = data['update' + type]

                    const extendedFilter = this.extendFilter(filter)

                    const variables = {page, limit, sort, _version, filter: extendedFilter}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables
                    })


                    if (storeData[storeKey]) {
                        // find entry in result list
                        const newData = {...storeData[storeKey], results: [...storeData[storeKey].results]}

                        const refResults = newData.results
                        const idx = refResults.findIndex(x => x._id === responseItem._id)
                        if (idx > -1) {
                            // update entry with new data
                            refResults[idx] = deepMerge({}, refResults[idx], changedData, optimisticData)
                            this.enhanceOptimisticData(refResults[idx])
                            // wirte it back to the cache
                            store.writeQuery({
                                query: gqlQuery,
                                variables,
                                data: {...storeData, [storeKey]: newData}
                            })
                            this._renderedTable = null
                            this.setState({data: newData})
                        }
                    }

                }
            })
        }
    }


    deleteData({type, page, limit, sort, filter, _version}, ids) {
        const {client} = this.props

        if (type && ids.length > 0) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)
            client.mutate({
                mutation: gql(ids.length > 1 ? queries.deleteMany : queries.delete),
                variables: {
                    _version,
                    _id: ids.length > 1 ? ids : ids[0]
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)
                    const extendedFilter = this.extendFilter(filter)

                    const variables = {page, limit, sort, _version, filter: extendedFilter}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables
                    })
                    if (storeData[storeKey]) {
                        const newData = {...storeData[storeKey], results: [...storeData[storeKey].results]}

                        const refResults = newData.results

                        const items = ids.length > 1 ? data['delete' + type + 's'] : [data['delete' + type]]
                        if (items) {
                            items.forEach(result => {
                                const idx = refResults.findIndex(x => x._id === result._id)
                                if (idx > -1) {
                                    if (result.status === 'deleting') {
                                        refResults[idx] = {...refResults[idx], status: 'deleting'}
                                    } else {
                                        refResults.splice(idx, 1)
                                        newData.total -= 1
                                    }
                                }
                            })
                        }

                        store.writeQuery({
                            query: gqlQuery,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })
                        this._renderedTable = null
                        this.setState({data: newData})

                    }

                },
            })
        }
    }


    cloneData({type, page, limit, sort, filter, _version}, clonable) {
        const {client, user} = this.props

        if (type) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)

            client.mutate({
                mutation: gql(queries.clone),
                variables: {_version, ...clonable},
                update: (store, {data}) => {
                    const freshData = {
                        ...data['clone' + type],
                        createdBy: {
                            _id: user.userData._id,
                            username: user.userData.username,
                            __typename: 'UserPublic'
                        }
                    }

                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type)

                    const extendedFilter = this.extendFilter(filter)
                    const variables = {limit, page, sort, _version, filter: extendedFilter}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables
                    })
                    if (storeData[storeKey]) {
                        const newData = {...storeData[storeKey], results: [...storeData[storeKey].results]}

                        if (freshData) {
                            newData.results.unshift(freshData)
                            newData.total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })
                        this._renderedTable = null
                        this.setState({data: newData})
                    }

                },
            })
        }
    }

    cloneCollection({type, name}) {
        if (type) {
            const {client} = this.props
            client.mutate({
                mutation: gql`mutation cloneCollection($type:String!,$name:String){cloneCollection(type:$type,name:$name){collection{name}}}`,
                variables: {name, type},
                update: (store, {data}) => {

                    if (data.cloneCollection && data.cloneCollection.collection) {

                        const variables = {filter: '^' + type + '_.*'}

                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({
                            query: gqlCollectionsQuery,
                            variables
                        })
                        if (storeData.collections) {
                            const newData = {...storeData.collections, results: [...storeData.collections.results]}

                            newData.results.push(data.cloneCollection.collection)
                            store.writeQuery({
                                query: gqlCollectionsQuery,
                                variables,
                                data: {...storeData, collections: newData}
                            })
                        }
                    }

                    /*const freshData = {
                     ...data['clone' + type],
                     createdBy: {
                     _id: user.userData._id,
                     username: user.userData.username,
                     __typename: 'UserPublic'
                     }
                     }*/
                }
            })
        }
    }

    goTo(args) {
        const {baseUrl, fixType} = this.props
        const {type, page, limit, sort, filter, _version, layout, multi, baseFilter, noLayout} = Object.assign({}, this.pageParams, args)
        this.props.history.push(`${baseUrl ? baseUrl : ADMIN_BASE_URL}${fixType ? '' : '/types/' + type}?p=${page}&l=${limit}&s=${sort}&f=${encodeURIComponent(filter)}&v=${_version}&noLayout=${noLayout}&layout=${layout}${multi ? '&multi=' + multi : ''}${baseFilter ? '&baseFilter=' + encodeURIComponent(baseFilter) : ''}`)
    }


    runFilter(f) {
        const {type} = this.pageParams
        this.setSettingsForType(type, {filter: f})
        this.goTo({page: 1, filter: f})
    }

    handleFilterTimeout = null
    handleFilter = ({value, target}, immediate) => {

        clearTimeout(this.handleFilterTimeout)
        if (immediate) {
            this.runFilter(value)
        } else {
            this.handleFilterTimeout = setTimeout(() => {
                this.runFilter(value)
                target.focus()
            }, 500)
        }
    }

    handelFilterKeyDown = (e, value) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            this.handleFilter({value}, true)
        }
    }

    handleSortChange = (orderBy) => {
        const {type, sort} = this.pageParams
        const aSort = sort.split(' ')
        let orderDirection = 'desc'
        if (aSort.length > 1 && orderBy === aSort[0] && orderDirection === aSort[1]) {
            orderDirection = 'asc'
        }
        const newSort = `${orderBy} ${orderDirection}`
        this.setSettingsForType(type, {sort: newSort})
        this.goTo({page: 1, sort: newSort})
    }


    handleTypeChange = event => {
        const v = event.target.value
        if (v !== this.pageParams.type) {
            this.settings.lastType = v
            this.props.history.push(`${ADMIN_BASE_URL}/types/${v}`)
        }
    }

    handleChangePage = (page) => {
        this.goTo({page})
    }


    handleChangeRowsPerPage = (limit) => {
        this.goTo({page: 1, limit})
    }

    handleDataChange = (event, data, field, lang) => {
        let key = field.name + (lang ? '.' + lang : '')
        let value

        if (event.target.type === 'checkbox') {
            value = event.target.checked
        } else {
            value = event.target.innerText.trim()
        }

        value = checkFieldType(value, field)

        const parts = key.split('.')
        if (parts.length === 2) {
            // localized.de
            key = parts[0]
            value = {[parts[1]]: value}
        }

        if (value !== data[key]) {
            const changedData = {_id: data._id, [key]: value}
            addAlwaysUpdateData(data, changedData, this.pageParams.type)
            this.updateData(changedData, null, this.pageParams)
        }
    }


    handleDeleteDataClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToDelete: [data]})
    }

    handleEditDataClick = (data) => {
        this.setState({createEditDialog: true, dataToEdit: data})
    }

    handleCopyClick = (data, fields) => {
        const newData = {}
        fields.forEach(field => {
            if (field.clone && !field.localized) {
                const tpl = new Function(DomUtil.toES5('const {' + Object.keys(data).join(',') + '} = this.data;return `' + field.clone + '`;'))
                newData[field.name] = tpl.call({data})
            }
        })
        this.cloneData(this.pageParams, {_id: data._id, ...newData})
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            this.deleteData(this.pageParams, this.state.dataToDelete.reduce((acc, item) => {
                acc.push(item._id)
                return acc
            }, []))
        }
        this.setState({confirmDeletionDialog: false, dataToDelete: false, selectAllRows: false, selectedrows: {}})
    }

    handleCloneClollection = (action) => {
        if (action && action.key === 'create') {
            const {type} = this.pageParams
            this.cloneCollection({type, name: this.state.collectionName})
        }
        this.setState({confirmCloneColDialog: false, collectionName: ''})
    }


    handleCreateEditData = (action) => {
        this.setState({createEditDialog: false, createEditDialogOption: null, dataToEdit: null})
    }

    handleViewSettingClose = (action) => {
        this._renderedTable = null
        this.setState({viewSettingDialog: false})
    }

    handleViewCollectionClose = (action) => {
        this.setState({manageColDialog: false})
    }
}

TypesContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    fixType: PropTypes.string,
    noLayout: PropTypes.bool,
    baseUrl: PropTypes.string,
    baseFilter: PropTypes.string,
    settings: PropTypes.object,
    title: PropTypes.any,
    onRef: PropTypes.func,
    classes: PropTypes.object.isRequired,
    /* To get and set settings */
    setKeyValue: PropTypes.func.isRequired,
    keyValueMap: PropTypes.object
}


const mapStateToProps = (store) => ({user: store.user})


export default connect(
    mapStateToProps
)(withApollo(withStyles(styles)(withKeyValues(TypesContainer, ['TypesContainerSettings', 'TypesContainerBulkEdit']))))
