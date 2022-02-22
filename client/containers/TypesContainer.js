import React from 'react'
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
    FilterListIcon,
    Divider,
    Paper,
    CloudUploadIcon
} from 'ui/admin'
import Util from 'client/util'
import TypeEdit from 'client/components/types/TypeEdit'
import config from 'gen/config-client'
import Hook from 'util/hook'
import {
    getTypes,
    getTypeQueries,
} from 'util/types'
import {
    checkFieldType,
    getFormFieldsByType,
    typeDataToLabel,
    addAlwaysUpdateData
} from 'util/typesAdmin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {getImageTag} from 'client/util/media'
import {deepMerge} from 'util/deepMerge'
import DomUtil from 'client/util/dom'
import {_t} from 'util/i18n'

const {ADMIN_BASE_URL, LANGUAGES} = config
import {COLLECTIONS_QUERY} from '../constants'
import GenericForm from '../components/GenericForm'
import {client, Query} from '../middleware/graphql'
import json2csv from 'util/json2csv'
import Async from '../components/Async'

const CodeEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "codeeditor" */ '../components/CodeEditor')}/>


const DEFAULT_RESULT_LIMIT = 10

const styles = theme => ({
    textLight: {
        color: 'rgba(0,0,0,0.4)'
    },
    tableContent: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 200
    },
    tableLargeContent: {
        overflowX: 'hidden',
        overflowY: 'auto',
        maxWidth: 600,
        maxHeight: 250
    },
    script: {
        fontFamily: '"Courier 10 Pitch", Courier, monospace',
        fontSize: '85%'
    },
    searchRoot: {
        padding: '2px 4px',
        display: 'flex',
        alignItems: 'center',
        marginBottom: theme.spacing(0),
    },
    searchHint: {
        color: 'rgb(150,150,150)',
        marginBottom: theme.spacing(1),
        marginTop: theme.spacing(0.5),
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
    }
})


class TypesContainer extends React.Component {


    types = null
    pageParams = null
    createEditForm = null
    typesToSelect = []
    settings = {}

    constructor(props) {
        super(props)

        this.types = getTypes()
        this.parseSettings(props)

        this.pageParams = this.determinePageParams(props)

        // initial state
        this.state = {
            type: this.pageParams.type,
            meta: this.pageParams.meta,
            selectAllRows: false,
            selectedRows: {},
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

        // prepare list with types for select box
        Object.keys(this.types).map((k) => {
            if (!this.settings[k] || !this.settings[k].hide) {
                const t = this.types[k]
                this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
            }
        })
    }

    parseSettings(props) {
        this.settings = Object.assign({}, props.keyValueMap.TypesContainerSettings)
    }

    setSettingsForType(type, settings) {
        const key = type + (this.pageParams.meta?'-'+this.pageParams.meta:'')
        this.settings[key] = Object.assign({}, this.settings[key], settings)

        this.saveSettings()
    }

    getSettingsForType(type, meta) {
        const key = type + (meta?'-'+meta:'')
        return this.settings[key] || {}
    }

    saveSettings() {
        const value = JSON.stringify(this.settings)
        if (value !== JSON.stringify(this.props.keyValueMap.TypesContainerSettings)) {
            this.props.setKeyValue({key: 'TypesContainerSettings', value})
        }
    }


    componentDidMount() {
        this.getData(this.pageParams, true)
        if (this.props.onRef)
            this.props.onRef(this)

        this._handleWindowClose = this.handleWindowClose.bind(this)
        this._urlChanged = this.urlChanged.bind(this)
        window.addEventListener('beforeunload', this._handleWindowClose)
        window.addEventListener('popstate', this._urlChanged)
    }

    componentWillUnmount() {
        setTimeout(() => {
            this.saveSettings()
        }, 1)
        window.removeEventListener('beforeunload', this._handleWindowClose)
        window.removeEventListener('popstate', this._urlChanged)
    }

    handleWindowClose() {
        this.saveSettings()
    }

    urlChanged() {
        const params = Util.extractQueryParams(window.location.search.substring(1))
        if (params.f && params.f !== this.state.filter) {
            this.setState({filter: params.f})
        }
    }


    shouldComponentUpdate(props, state) {
        const settingsChanged = this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings
        const pageParams = this.determinePageParams(props),
            typeChanged = this.pageParams.type !== pageParams.type,
            metaChanged = this.pageParams.meta !== pageParams.meta

        if (settingsChanged) {
            this.parseSettings(props)
        }
        if (/*settingsChanged ||*/
            this.props.settings !== props.settings ||
            this.props.baseFilter !== props.baseFilter ||
            this.pageParams.page !== pageParams.page ||
            typeChanged ||
            metaChanged ||
            this.pageParams._version !== pageParams._version ||
            this.pageParams.limit !== pageParams.limit ||
            this.pageParams.sort !== pageParams.sort ||
            this.pageParams.baseFilter !== pageParams.baseFilter ||
            this.pageParams.filter !== pageParams.filter) {

            this.pageParams = pageParams
            this.getData(pageParams, true, typeChanged || metaChanged)

            return false
        }

        return this.state !== state ||
            this.state.data !== state.data ||
            this.state.filter !== state.filter ||
            this.state.selectedRows !== state.selectedRows ||
            this.props.location !== props.location ||
            this.props.baseFilter !== props.baseFilter ||
            settingsChanged
    }

    renderTable(columns) {
        const {classes} = this.props
        const {data, selectedRows} = this.state
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
                            checked={!!selectedRows[item._id]}
                            onChange={this.handleRowSelect.bind(this)}
                            value={item._id}
                        />
                    }

                    fields.forEach(field => {
                        if (columnsMap[field.name]) {
                            let fieldValue = item[field.name]
                            if (field.alwaysLoad === false) {
                                dynamic[field.name] = '...'
                            } else if (field.reference) {
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
                                                    if (fieldValue[f].constructor === Object) {
                                                        str += fieldValue[f][_app_.lang]
                                                    } else {
                                                        str += fieldValue[f]
                                                    }


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
                                if (fieldValue && fieldValue.constructor === String) {
                                    if (fieldValue.length > 50) {
                                        dynamic[field.name] = <span
                                            className={classes.script}>{fieldValue.substring(0, 20) + '...' + fieldValue.substring(fieldValue.length - 20)}</span>
                                    } else {
                                        dynamic[field.name] = <span className={classes.script}>{fieldValue}</span>
                                    }
                                } else {
                                    dynamic[field.name] = ''
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
                        entryActions.push(
                            {
                                name: _t('TypesContainer.exportEntry'),
                                disabled: (item.status == 'deleting' || item.status == 'updating'),
                                onClick: this.handleExportClick.bind(this, item, fields),
                                icon: <CloudUploadIcon/>
                            })

                        entryActions.push({
                            name: _t('TypesContainer.deleteEntry'),
                            disabled: (item.status == 'deleting' || item.status == 'updating'),
                            onClick: this.handleDeleteDataClick.bind(this, item),
                            icon: <DeleteIcon/>
                        })
                        Hook.call('TypeTableEntryAction', {type, actions: entryActions, item, container: this})

                        dynamic._action = <SimpleMenu mini items={entryActions}/>

                    }
                    dataSource.push(dynamic)
                })
            }
            const asort = sort.split(' ')

            /* HOOK */
            Hook.call('TypeTable', {type, dataSource, data, fields, container: this})

            const selectedLength = Object.keys(this.state.selectedRows).length
            const actions = [
                {
                    name: _t('TypesContainer.addNew', {type}), onClick: () => {
                        setTimeout(() => {
                            this.setState({createEditDialog: true})
                        }, 0)

                    }
                },
                {
                    key: 'export_csv',
                    name: 'Export CSV', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                title: 'Export CSV',
                                children: <textarea style={{
                                    width: '30rem',
                                    height: '30rem'
                                }}>{json2csv(this.state.data.results)}</textarea>
                            }
                        })
                    }
                },
                {
                    name: 'Export JSON', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                title: 'Export',
                                children: <textarea style={{
                                    width: '30rem',
                                    height: '30rem'
                                }}>{JSON.stringify(this.state.data.results, null, 2)}</textarea>
                            }
                        })
                    }
                },
                {
                    name: 'Import JSON', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                title: 'Import',
                                actions: [{key: 'import', label: 'Import'}],
                                onClose: (e) => {
                                    if (e.key === 'import') {
                                        client.query({
                                            fetchPolicy: 'network-only',
                                            query: `query importCollection($collection: String!, $json: String!){importCollection(collection:$collection,json:$json){result}}`,
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
                                                    style={{width: '30rem', height: '30rem'}}></textarea>
                            }
                        })
                    }
                },
                {
                    name: _t('TypesContainer.tableSettings'), onClick: () => {
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

            Hook.call('TypeTableAction', {type, actions, pageParams: this.pageParams}, this)

            return <SimpleTable key="typeTable"
                                style={{marginBottom: window.opener && selectedLength > 0 && this.pageParams.multi === 'true' ? '5rem' : ''}}
                                title=""
                                onRowClick={this.handleRowClick.bind(this)}
                                dataSource={dataSource}
                                columns={columnsFiltered}
                                count={data.total}
                                rowsPerPage={limit} page={page}
                                orderBy={asort[0]}
                                header={this.types[type].collectionClonable &&
                                <Query query={COLLECTIONS_QUERY}
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
                                            label={_t('TypesContainer.selectVersion')}
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
                                    style={{marginRight: '2rem'}}>{_t('TypesContainer.selectedRows', {count: selectedLength})}</p>{selectedLength ?
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

        }

        return null
    }


    render() {
        const startTime = new Date()
        const {simpleDialog, dataToEdit, createEditDialog, viewSettingDialog, viewFilterDialog, confirmCloneColDialog, manageColDialog, dataToDelete, dataToBulkEdit, confirmDeletionDialog} = this.state
        const {title, classes} = this.props
        const {type, fixType, noLayout} = this.pageParams
        const formFields = getFormFieldsByType(type), columns = this.getTableColumns(type)

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

            const formFields = getFormFieldsByType(type), filterFields = {}


            columns.map(c => {
                if (formFields[c.id] && formFields[c.id].type !== 'Object' && formFields[c.id].uitype !== 'password' && this.isColumnActive(type, c.id)) {
                    const filterField = Object.assign({}, formFields[c.id])
                    filterField.fullWidth = true
                    delete filterField.tab
                    delete filterField.required
                    if (['editor', 'json'].indexOf(filterField.uitype) >= 0) {
                        filterField.uitype = 'text'
                    }

                    filterFields[c.id] = filterField
                }
            })

            Hook.call('TypesContainerBeforeFilterDialog', {type, filterFields}, this)


            let formRef
            viewFilterDialogProps = {
                title: 'Filter',
                maxWidth:'md',
                fullWidth:true,
                open: this.state.viewFilterDialog,
                onClose: () => {
                    let newFilter = ''
                    Object.keys(formRef.state.fields).forEach(fieldKey => {
                        const value = formRef.state.fields[fieldKey]
                        if (value) {
                            if (newFilter) {
                                newFilter += ' && '
                            }

                            if (value.constructor === Array) {
                                let ids = []
                                value.forEach(item => {
                                    ids.push(item._id)
                                })
                                newFilter += `${fieldKey}==[${ids.join(',')}]`
                            } else {
                                newFilter += `${fieldKey}=${value}`
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
                    }} fields={filterFields}/>
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
                meta: {TypeContainer: this}
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
        const selectedLength = Object.keys(this.state.selectedRows).length
        const {description} = this.types[type]

        const content = [
            !title && !this.pageParams.title ? null :
                <Typography key="typeTitle" variant="h3"
                            gutterBottom>{title || this.pageParams.title}</Typography>,
            description ?
                <Typography key="typeDescription" variant="subtitle1" gutterBottom>{description}</Typography> : null,
            <div key="typeHeader">
                <Row spacing={2}>
                    {!fixType &&
                    <Col md={6}>
                        <SimpleSelect
                            value={type}
                            onChange={this.handleTypeChange}
                            items={this.typesToSelect}
                        />
                    </Col>
                    }
                    <Col xs={12} md={(fixType ? 12 : 6)} align="right">

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
                                <FilterListIcon/>
                            </IconButton>
                        </Paper>
                    </Col>
                </Row>
                <Typography className={classes.searchHint} component="div" key="searchHint"
                            variant="caption">{this.searchHint()}</Typography>
            </div>,
            this.renderTable(columns),
            dataToDelete &&
            <SimpleDialog key="deleteDialog" open={confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: _t('core.yes')}, {
                              key: 'no',
                              label: _t('core.no'),
                              type: 'primary'
                          }]}
                          title={_t('TypesContainer.deleteConfirmTitle')}>
                {dataToDelete.length > 1 ? _t('TypesContainer.deleteConfirmTextMulti') : _t('TypesContainer.deleteConfirmText')}
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
                                      query: `query bulkEdit($collection:String!,$_id:[ID]!,$script:String!){bulkEdit(collection:$collection,_id:$_id,script:$script){result}}`,
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
                                    if (this.state.selectedRows[item._id]) {
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

        if (noLayout) {
            return content
        }
        return <BaseLayout key="baseLayout">{content}</BaseLayout>
    }

    searchHint() {
        const {data} = this.state
        if (data && data.meta) {
            const meta = JSON.parse(data.meta)
            return `Abfragezeit ${meta.aggregateTime}ms / ${meta.totalTime}ms${meta.debugInfo && meta.debugInfo.length > 0 ? ' - ' + meta.debugInfo.join(' | ') : ''}`
        }
        return ' '
    }

    isColumnActive(type, id) {
        const {settings} = this.props
        let s
        if (settings && settings[type]) {
            // check settings from props if available
            s = settings[type]
        } else {
            s = this.getSettingsForType(type, this.pageParams.meta)
        }

        if (s && s.columns) {
            return s.columns[id] === undefined || s.columns[id]
        }

        // check if field is hidden by default
        const formFields = getFormFieldsByType(type)
        if (formFields && formFields[id] && formFields[id].hideColumnInTypes) {
            return false
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
            Object.keys(this.state.selectedRows).forEach(_id => {
                dataToDelete.push({_id})
            })
            this.setState({dataToDelete, confirmDeletionDialog: true})

        } else if (value === 'edit') {
            const dataToBulkEdit = []
            Object.keys(this.state.selectedRows).forEach(_id => {
                dataToBulkEdit.push(_id)
            })
            this.setState({dataToBulkEdit})
        }
    }


    handleRowSelect(e) {
        const target = e.target, checked = target.checked, value = target.value
        const selectedRows = Object.assign({}, this.state.selectedRows)

        const update = (value) => {
            if (checked) {
                selectedRows[value] = checked
            } else {
                delete selectedRows[value]
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
        this.setState({selectedRows, selectAllRows})

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

    determinePageParams(props) {
        const {params} = props.match || {}
        const {p, l, s, f, v, noLayout, fixType, title, baseFilter, multi, meta, action} = Util.extractQueryParams(window.location.search.substring(1))
        const pInt = parseInt(p), lInt = parseInt(l)

        const finalFixType = fixType || props.fixType,
            finalNoLayout = noLayout === 'true' ? true : noLayout === 'false' ? false : props.noLayout,
            finalBaseFilter = baseFilter || props.baseFilter

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
        const typeSettings = this.getSettingsForType(type, meta)
        const result = {
            baseFilter: finalBaseFilter,
            multi,
            title,
            meta,
            action,
            fixType: finalFixType,
            noLayout: finalNoLayout,
            limit: lInt || typeSettings.limit || DEFAULT_RESULT_LIMIT,
            page: pInt || typeSettings.page || 1,
            sort: s || typeSettings.sort || '',
            filter: f || typeSettings.filter || '',
            _version: v || typeSettings._version || 'default'
        }
        result.type = type
        return result
    }

    getStoreKey(type) {
        return type.charAt(0).toLowerCase() + type.slice(1) + 's'
    }

    enhanceOptimisticData(o) {
        const formFields = getFormFieldsByType(this.pageParams.type)
        for (let k in o) {
            if (o[k] && formFields[k] && formFields[k].localized) {
                o[k] = {...o[k], __typename: 'LocalizedString'}
            }
        }
    }

    extendFilter(filter) {
        const {baseFilter} = this.pageParams
        return filter + (baseFilter ? (filter ? ' && ' : '') + baseFilter : '')
    }

    getData({type, page, limit, sort, filter, meta, _version}, cacheFirst, typeChanged) {
        if (type) {
            const queries = getTypeQueries(type, false, {loadAll: false})
            if (queries) {
                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, meta, _version, filter: this.extendFilter(filter)}
                if (cacheFirst) {
                    try {
                        const storeData = client.readQuery({
                            query: queries.query,
                            variables
                        })
                        if (storeData && storeData[storeKey]) {
                            // oh data are available in cache. show them first
                            setTimeout(() => {
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
                    query: queries.query,
                    variables
                }).then(response => {
                    const o = response.data[storeKey]
                    const newState = {data: o}

                    if (typeChanged) {
                        newState.filter = filter
                    }
                    if (this.pageParams.action === 'new') {
                        newState.createEditDialog = true


                    }


                    this.setState(newState)

                }).catch(error => {
                    console.log(error.message)
                    this.setState({data: null})
                })

            }
        }
    }

    createData(input, optimisticInput) {
        const {type, page, limit, sort, filter, meta, _version} = this.pageParams
        const {user} = this.props

        if (type) {
            const queries = getTypeQueries(type, false, {loadAll: false})
            return client.mutate({
                mutation: queries.create,
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

                    const storeKey = this.getStoreKey(type)
                    const extendedFilter = this.extendFilter(filter)

                    const variables = {limit, page, sort, meta, _version, filter: extendedFilter}

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: queries.query,
                        variables
                    })
                    if (storeData[storeKey]) {
                        const newData = {...storeData[storeKey], results: [...storeData[storeKey].results]}

                        if (freshData) {
                            newData.results.unshift(freshData)
                            newData.total += 1
                        }
                        store.writeQuery({
                            query: queries.query,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })
                        this.setState({data: newData})
                    }

                },
            })
        }
    }

    updateData(changedData, optimisticData) {

        const {type, page, limit, sort, filter, meta, _version} = this.pageParams

        if (type) {
            const queries = getTypeQueries(type, false, {loadAll: false})
            return client.mutate({
                mutation: queries.update,
                /* only send what has changed*/
                variables: {_version, ...changedData},
                update: (store, {data}) => {
                    const storeKey = this.getStoreKey(type),
                        responseItem = data['update' + type]
                    const extendedFilter = this.extendFilter(filter)

                    const variables = {limit, page, sort, meta, _version, filter: extendedFilter}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: queries.query,
                        variables
                    })

                    if (storeData && storeData[storeKey]) {
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
                                query: queries.query,
                                variables,
                                data: {...storeData, [storeKey]: newData}
                            })

                            this.setState({data: newData})
                        }
                    }

                }
            })
        }
    }


    deleteData({type, page, limit, sort, filter, meta, _version}, ids) {
        if (type && ids.length > 0) {

            const queries = getTypeQueries(type, false, {loadAll: false}),
                storeKey = this.getStoreKey(type)
            client.mutate({
                mutation: (ids.length > 1 ? queries.deleteMany : queries.delete),
                variables: {
                    _version,
                    _id: ids.length > 1 ? ids : ids[0]
                },
                update: (store, {data}) => {
                    const extendedFilter = this.extendFilter(filter)

                    const variables = {limit, page, sort, meta, _version, filter: extendedFilter}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: queries.query,
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
                            query: queries.query,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })
                        this.setState({data: newData})

                    }

                },
            })
        }
    }


    cloneData(clonable, optimisticData) {
        const {type, page, limit, sort, filter, meta, _version} = this.pageParams

        const {user} = this.props

        if (type) {

            const queries = getTypeQueries(type, false, {loadAll: false}),
                storeKey = this.getStoreKey(type)

            client.mutate({
                mutation: queries.clone,
                variables: {_version, ...clonable},
                update: (store, {data}) => {
                    const clonedData = data['clone' + type]
                    const freshData = {
                        ...optimisticData,
                        ...clonable,
                        _id: clonedData._id,
                        modifiedAt: null,
                        createdBy: {
                            _id: user.userData._id,
                            username: user.userData.username
                        }
                    }

                    const storeKey = this.getStoreKey(type)

                    const extendedFilter = this.extendFilter(filter)
                    const variables = {limit, page, sort, meta, _version, filter: extendedFilter}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: queries.query,
                        variables
                    })
                    if (storeData[storeKey]) {
                        const newData = {...storeData[storeKey], results: [...storeData[storeKey].results]}

                        if (freshData) {
                            newData.results.unshift(freshData)
                            newData.total += 1
                        }
                        store.writeQuery({
                            query: queries.query,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })
                        this.setState({data: newData})
                    }

                },
            })
        }
    }

    cloneCollection({type, name}) {
        if (type) {
            client.mutate({
                mutation: `mutation cloneCollection($type:String!,$name:String){cloneCollection(type:$type,name:$name){collection{name}}}`,
                variables: {name, type},
                update: (store, {data}) => {

                    if (data.cloneCollection && data.cloneCollection.collection) {

                        const variables = {filter: '^' + type + '_.*'}

                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({
                            query: COLLECTIONS_QUERY,
                            variables
                        })
                        if (storeData.collections) {
                            const newData = {...storeData.collections, results: [...storeData.collections.results]}

                            newData.results.push(data.cloneCollection.collection)
                            store.writeQuery({
                                query: COLLECTIONS_QUERY,
                                variables,
                                data: {...storeData, collections: newData}
                            })
                        }
                    }
                }
            })
        }
    }

    goTo(args) {
        const {baseUrl} = this.props
        const {type, page, limit, sort, filter, fixType, _version, multi, baseFilter, noLayout, title, meta} = Object.assign({}, this.pageParams, args)
        this.props.history.push(`${baseUrl ? baseUrl : ADMIN_BASE_URL + '/types' + (type ? '/' + type : '')}?p=${page}&l=${limit}&s=${sort}&f=${encodeURIComponent(filter)}&v=${_version}${fixType ? '&fixType=' + fixType : ''}${noLayout ? '&noLayout=' + noLayout : ''}${title ? '&title=' + encodeURIComponent(title) : ''}${meta ? '&meta=' + meta : ''}${multi ? '&multi=' + multi : ''}${baseFilter ? '&baseFilter=' + encodeURIComponent(baseFilter) : ''}`)
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
            this.updateData(changedData, null)
        }
    }


    handleDeleteDataClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToDelete: [data]})
    }

    handleEditDataClick = (data) => {

        //load missing data if needed
        const {type, _version} = this.pageParams

        const typeData = this.types[type]
        const fieldsToLoad = []
        typeData.fields.forEach(field => {
            if (field.alwaysLoad === false) {
                fieldsToLoad.push(field.name)
            }
        })

        const variables = {_version, filter: '_id=' + data._id}

        Hook.call('TypeTableBeforeEdit', {type, data, variables, fieldsToLoad})

        if (fieldsToLoad.length > 0) {

            const queries = getTypeQueries(type, fieldsToLoad)

            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: queries.query,
                variables
            }).then(response => {
                const storeKey = this.getStoreKey(type)

                fieldsToLoad.forEach(field => {
                    data[field] = response.data[storeKey].results[0][field]
                })
                this.setState({createEditDialog: true, dataToEdit: data})

            }).catch(error => {
                console.log(error.message)
                this.setState({data: null})
            })

        } else {
            this.setState({createEditDialog: true, dataToEdit: data})
        }
    }

    handleCopyClick = (data, fields) => {
        const newData = {}
        fields.forEach(field => {
            if (field.clone && !field.localized) {
                const tpl = new Function(DomUtil.toES5('const {' + Object.keys(data).join(',') + '} = this.data;return `' + field.clone + '`;'))
                newData[field.name] = tpl.call({data})
            }
        })
        this.cloneData({_id: data._id, ...newData}, data)
    }
    handleExportClick = (data, fields) => {

        const {type} = this.pageParams
        const query = '{"_id":{"$oid":"' + data._id + '"}}'

        client.query({
            fetchPolicy: 'network-only',
            query: `query exportQuery($type: String!, $query: String){exportQuery(type:$type,query:$query){result}}`,
            variables: {
                type,
                query
            }
        }).then(response => {
            const a = document.createElement('a')
            a.href = response.data.exportQuery.result
            a.target = '_blank'
            a.click()
        })
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            this.deleteData(this.pageParams, this.state.dataToDelete.reduce((acc, item) => {
                acc.push(item._id)
                return acc
            }, []))
        }
        this.setState({confirmDeletionDialog: false, dataToDelete: false, selectAllRows: false, selectedRows: {}})
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
        this.setState({viewSettingDialog: false})
    }

    handleViewCollectionClose = (action) => {
        this.setState({manageColDialog: false})
    }
}

TypesContainer.propTypes = {
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
)(withStyles(styles)(withKeyValues(TypesContainer, ['TypesContainerSettings', 'TypesContainerBulkEdit'])))
