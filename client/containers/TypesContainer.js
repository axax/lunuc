import React from 'react'
import PropTypes from 'prop-types'
import ManageCollectionClones from '../components/types/ManageCollectionClones'
import SyncCollectionDialog from '../components/types/SyncCollectionDialog'
import {
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
    ExpandMoreIcon,
    SaveIcon,
    Divider,
    Paper,
    CloudUploadIcon,
    SyncIcon
} from 'ui/admin'
import Util from 'client/util/index.mjs'
import TypeEdit from 'client/components/types/TypeEdit'
import config from 'gen/config-client'
import Hook from 'util/hook.cjs'
import {
    getTypes,
    getTypeQueries, getSubscribeQuery,
} from 'util/types.mjs'
import {
    checkFieldType,
    getFormFieldsByType,
    typeDataToLabel,
    addAlwaysUpdateData, hasFieldsForBulkEdit, getFieldsForBulkEdit, referencesToIds
} from 'util/typesAdmin.mjs'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {getImageTag} from 'client/util/media'
import {deepMerge} from 'util/deepMerge.mjs'
import DomUtil from 'client/util/dom.mjs'
import {downloadAs} from 'client/util/download.js'
import {_t} from 'util/i18n.mjs'

const {ADMIN_BASE_URL, LANGUAGES} = config
import {COLLECTIONS_QUERY} from '../constants/index.mjs'
import GenericForm from '../components/GenericForm'
import {client, clearFetchById} from '../middleware/graphql'
import json2csv from 'util/json2csv'
import Async from '../components/Async'
import styled from '@emotion/styled'
import {
    CAPABILITY_BULK_EDIT,
    CAPABILITY_BULK_EDIT_SCRIPT,
    CAPABILITY_MANAGE_COLLECTION
} from '../../util/capabilities.mjs'
import SelectCollection from '../components/types/SelectCollection'
import {parseOrElse} from "../util/json.mjs";

const CodeEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "codeeditor" */ '../components/CodeEditor')}/>


const DEFAULT_RESULT_LIMIT = 10

const StyledTableContentEllipsis = styled('div')({
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 200
})

const StyledTableContent = styled('div')({
    overflowX: 'hidden',
    overflowY: 'auto',
    maxWidth: 600,
    maxHeight: 250
})

const StyledTableScript = styled('span')({
    fontFamily: '"Courier 10 Pitch", Courier, monospace',
    fontSize: '85%'
})


function getFieldTitle(type, field) {
    return _t(`${type}.field.${field.name}`, null, (field.label || field.name) + (field.localized ? ' [' + _app_.lang + ']' : ''));
}

class TypesContainer extends React.Component {


    types = null
    pageParams = null
    createEditForm = null
    typesToSelect = []
    settings = {}
    subscriptions = {}

    constructor(props) {
        super(props)

        this.types = getTypes()
        this.parseSettings(props)

        this.pageParams = this.determinePageParams(props)

        // initial state
        this.state = {
            opener: this.pageParams.opener,
            type: this.pageParams.type,
            meta: this.pageParams.meta,
            selectAllRows: false,
            selectedRows: {},
            confirmDialog: {open:false},
            viewSettingDialog: undefined,
            viewSyncDialog: undefined,
            viewFilterDialog: undefined,
            manageColDialog: undefined,
            confirmCloneColDialog: undefined,
            dataToBulkEdit: null,
            createEditDialog: undefined,
            createEditDialogOption: null,
            dataToEdit: null,
            data: null,
            collectionName: '',
            collectionEmpty: false,
            simpleDialog: false,
            filter: this.pageParams.filter
        }

        // prepare list with types for select box
        Object.keys(this.types).sort().map((k) => {
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
        const key = type + (this.pageParams.meta ? '-' + this.pageParams.meta : '')
        this.settings[key] = Object.assign({}, this.settings[key], settings)

        this.saveSettings()
    }

    getSettingsForType(type, meta) {
        const key = type + (meta ? '-' + meta : '')
        return this.settings[key] || {}
    }

    saveSettings() {
        const value = JSON.stringify(this.settings)
        if (value !== JSON.stringify(this.props.keyValueMap.TypesContainerSettings)) {
            console.log(`save TypesContainerSettings`)
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
        if(this.pageParams.open){
            const queries = getTypeQueries(this.pageParams.type)
            client.query({
                fetchPolicy: 'network-only',
                query: queries.query,
                variables: {filter: `_id==${this.pageParams.open}`}
            }).then(response => {
                const storeKey = this.getStoreKey(this.pageParams.type)
                this.setState({createEditDialog: true, dataToEdit: response.data[storeKey].results[0]})

            }).catch(error => {
                console.log(error.message)
            })
        }
    }

    componentWillUnmount() {
        setTimeout(() => {
            this.saveSettings()
        }, 1)
        window.removeEventListener('beforeunload', this._handleWindowClose)
        window.removeEventListener('popstate', this._urlChanged)
        clearFetchById('TypesContainer')
        this.removeSubscriptions()
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
            this.pageParams.view !== pageParams.view ||
            this.pageParams.baseFilter !== pageParams.baseFilter ||
            this.pageParams.prettyFilter !== pageParams.prettyFilter ||
            this.pageParams.filter !== pageParams.filter) {

            this.pageParams = pageParams
            this.getData(pageParams, true, typeChanged || metaChanged)

            return false
        }

        return this.state !== state ||
            this.state.data !== state.data ||
            this.state.filter !== state.filter ||
            this.state.selectedRows !== state.selectedRows ||
            this.props.location.href !== props.location.href ||
            this.props.baseFilter !== props.baseFilter ||
            settingsChanged
    }

    renderTable(columns, typeSettings) {
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
                                                s.push(getImageTag(i, {size:'avatar',key: i._id, height: 40}))
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
                                            dynamic[field.name] = getImageTag(fieldValue, {size:'avatar',height: 40})
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
                                        dynamic[field.name] = <StyledTableScript>
                                            {fieldValue.substring(0, 20) + '...' + fieldValue.substring(fieldValue.length - 20)}
                                        </StyledTableScript>
                                    } else {
                                        dynamic[field.name] = <StyledTableScript>{fieldValue}</StyledTableScript>
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
                                    if(this.settings.showTranslations) {
                                        const langVar = []

                                        LANGUAGES.map(lang => {
                                            langVar.push(<StyledTableContentEllipsis key={lang}>
                                                <Typography mb={0} variant="body2" component="span"
                                                            color="text.disabled">{lang}:</Typography> <span
                                                onBlur={e => this.handleDataChange.bind(this)(e, item, field, lang)}
                                                suppressContentEditableWarning
                                                dangerouslySetInnerHTML={{
                                                    __html: fieldValue && fieldValue[lang]
                                                }}
                                                contentEditable/>
                                            </StyledTableContentEllipsis>)
                                        })
                                        dynamic[field.name] = langVar
                                    }else{
                                        dynamic[field.name] = fieldValue && fieldValue[_app_.lang]
                                    }
                                } else {
                                    if (fieldValue && fieldValue.constructor === Array) {
                                        if(field.enum && !field._enumMap){

                                            if(field.enum==='$TYPES'){
                                                field.enum = Object.keys(getTypes())
                                            }
                                            field._enumMap = field.enum.reduce( (acc,f)=>{
                                                acc[f.value || f] = f.name || f
                                                return acc
                                            },{})
                                        }
                                        dynamic[field.name] = fieldValue.map(e =>
                                            <Chip key={e} label={field._enumMap?field._enumMap[e] || e:e}/>
                                        )
                                    } else {
                                        if(field.enum){
                                            if(fieldValue) {
                                                const enumEntry = field.enum.find(f => f.value == fieldValue)

                                                dynamic[field.name] = enumEntry && enumEntry.name ? enumEntry.name : _t(`${type}.field.${field.name}.enum.${fieldValue}`,{},fieldValue)
                                            }
                                        }else if (field.access && field.access.ui && field.access.ui.role && !Util.hasCapability(_app_.user, field.access.ui.role)){
                                            dynamic[field.name] = fieldValue
                                        }else {
                                            dynamic[field.name] =
                                                <StyledTableContent
                                                    onBlur={e => this.handleDataChange.bind(this)(e, item, field)}
                                                    suppressContentEditableWarning contentEditable
                                                    dangerouslySetInnerHTML={{
                                                        __html: fieldValue
                                                    }}/>
                                        }
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
                        dynamic.date =
                            <span><span>{Util.formattedDateFromObjectId(item._id)}</span><br/><small>{item._id}</small></span>
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

                        entryActions.push({
                            name: _t('TypesContainer.deleteEntry'),
                            disabled: (item.status == 'deleting' || item.status == 'updating'),
                            onClick: this.handleDeleteDataClick.bind(this, [item]),
                            icon: <DeleteIcon/>
                        })


                        entryActions.push(
                            {
                                divider:true,
                                name: _t('TypesContainer.exportEntry'),
                                disabled: (item.status == 'deleting' || item.status == 'updating'),
                                onClick: this.handleExportClick.bind(this, item, fields),
                                icon: <CloudUploadIcon/>
                            })

                        if (this.types[type].collectionClonable && this.types[type].entryClonable) {
                            entryActions.push(
                                {
                                    divider:true,
                                    name: _t('TypesContainer.syncEntry'),
                                    disabled: (item.status == 'deleting' || item.status == 'updating'),
                                    onClick: this.handleSyncClick.bind(this, item),
                                    icon: <SyncIcon/>
                                })
                        }
                        Hook.call('TypeTableEntryAction', {type, actions: entryActions, item, container: this})

                        dynamic._action = <SimpleMenu mini items={entryActions}/>

                    }
                    dataSource.push(dynamic)
                })
            }
            const asort = sort.split(' ')

            const capaManageCollections = Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_COLLECTION)


            /* HOOK */
            Hook.call('TypeTable', {type, dataSource, data, fields, container: this})

            const selectedLength = Object.keys(this.state.selectedRows).length
            const actions = [
                {
                    icon: 'add',
                    name: _t('TypesContainer.addNew', {type}), onClick: () => {
                        setTimeout(() => {
                            this.setState({createEditDialog: true})
                        }, 0)

                    }
                },
                {
                    divider:true,
                    key: 'export_csv',
                    name: 'Export CSV', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                title: 'Export CSV',
                                actions: [{key: 'close', label: 'Ok'}, {key: 'download', label: 'Download'}],
                                onClose: (e) => {
                                    if (e.key === 'download') {
                                        downloadAs(json2csv(this.state.data.results), 'export.csv')
                                        this.setState({simpleDialog: false})
                                    } else {
                                        this.setState({simpleDialog: false})
                                    }
                                },
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
                                actions: [{key: 'close', label: 'Ok'}, {key: 'download', label: 'Download'}],
                                onClose: (e) => {
                                    if (e.key === 'download') {
                                        downloadAs(JSON.stringify(this.state.data.results, null, 2), 'export.json')
                                        this.setState({simpleDialog: false})
                                    } else {
                                        this.setState({simpleDialog: false})
                                    }
                                },
                                children: <textarea style={{
                                    width: '30rem',
                                    height: '30rem'
                                }}>{JSON.stringify(this.state.data.results, null, 2)}</textarea>
                            }
                        })
                    }
                },
                {
                    name: 'Import', onClick: () => {
                        this.setState({
                            simpleDialog: {
                                maxWidth:'lg',
                                fullWidth:true,
                                title: 'Import (JSON, CSV)',
                                actions: [{key: 'import', label: 'Import'}],
                                onClose: (e) => {
                                    if (e.key === 'import') {
                                        client.query({
                                            fetchPolicy: 'network-only',
                                            query: `query importCollection($collection: String!, $json: String!, $meta: String){importCollection(collection:$collection,json:$json,meta:$meta){result}}`,
                                            variables: {
                                                collection: type,
                                                json: document.getElementById('importData').value,
                                                meta:this.pageParams.meta
                                            }
                                        }).then(response => {
                                            this.setState({simpleDialog: {children: JSON.stringify(response.data.importCollection)}})
                                        })
                                    } else {
                                        this.setState({simpleDialog: false})
                                    }
                                },
                                children: <textarea id="importData"
                                                    style={{width: '100%', height: '30rem'}}></textarea>
                            }
                        })
                    }
                },
                {
                    divider:true,
                    name: _t('TypesContainer.tableSettings'), onClick: () => {
                        this.setState({viewSettingDialog: true})
                    },
                    icon:'displaySetting'
                },
                {
                    name: _t('TypesContainer.refresh'), onClick: () => {
                        this.getData(this.pageParams, false)
                    },
                    icon:'refresh'
                }]

            if (this.types[type].collectionClonable) {
                actions.push({

                    divider:true,
                    name: _t('TypesContainer.createNewVersion'), onClick: () => {
                        this.setState({confirmCloneColDialog: true})
                    }, icon:'addList'
                })
                actions.push({
                    name: _t('TypesContainer.manageVersion'), onClick: () => {
                        this.setState({manageColDialog: true})
                    }, icon:'editList'
                })
            }

            const multiSelectActions = [{name: _t('TypesContainer.delete'), value: 'delete'}]

            if(Util.hasCapability({userData: _app_.user}, CAPABILITY_BULK_EDIT) && hasFieldsForBulkEdit(type)){
                multiSelectActions.push( {name: _t('TypesContainer.bulkEdit'), value: 'edit'})
            }

            if(Util.hasCapability({userData: _app_.user}, CAPABILITY_BULK_EDIT_SCRIPT)){
                multiSelectActions.push( {name: _t('TypesContainer.bulkEditScript'), value: 'editScript'})
            }


            Hook.call('TypeTableAction', {type, actions, multiSelectActions, pageParams: this.pageParams, data}, this)
            return <SimpleTable key="typeTable"
                                title=""
                                tableRenderer={this.tableRenderer}
                                tableRenderOption={typeSettings.tableRenderOption}
                                onRowClick={this.handleRowClick.bind(this)}
                                dataSource={dataSource}
                                columns={columnsFiltered}
                                count={data.total}
                                rowsPerPage={limit} page={page}
                                orderBy={asort[0]}
                                header={this.types[type].collectionClonable &&
                                    capaManageCollections &&
                                    <SelectCollection type={type}
                                                      onChange={(e) => {
                                                          this.goTo({_version: e.target.value})
                                                          this.setSettingsForType(type, {_version: e.target.value})
                                                      }}
                                                      _version={_version} />
                                }
                                actions={actions}
                                footer={<div style={{display: 'flex', alignItems: 'center', minHeight: '48px'}}>
                                    <p style={{marginRight: '2rem'}}>{_t('TypesContainer.selectedRows', {count: selectedLength})}</p>{selectedLength ?
                                    <SimpleSelect
                                        label={_t('TypesContainer.multiSelectAction')}
                                        value=""
                                        style={{marginBottom: 0, marginTop: 0}}
                                        onChange={this.handleBatchAction.bind(this)}
                                        items={multiSelectActions}
                                    /> : ''}
                                </div>}
                                orderDirection={asort.length > 1 && asort[1] || null}
                                onSort={this.handleSortChange}
                                onChangePage={this.handleChangePage.bind(this)}
                                onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>

        }

        return null
    }


    render() {
        const startTime = new Date()
        const {
            simpleDialog,
            dataToEdit,
            createEditDialog,
            viewSettingDialog,
            viewFilterDialog,
            viewSyncDialog,
            dataToSync,
            confirmCloneColDialog,
            manageColDialog,
            dataToBulkEdit,
            confirmDialog,
            createEditDialogOption
        } = this.state
        const {title} = this.props
        const {type, fixType,_version} = this.pageParams
        const columns = this.getTableColumns(type)
        if (!this.types[type]) {
            return <>
                <Typography variant="subtitle1" color="error">Type {type} does not
                    exist.
                    Types can be specified in an extension. Please select another type.</Typography>
                <SimpleSelect
                    value={type}
                    onChange={this.handleTypeChange}
                    items={this.typesToSelect}/>
            </>
        }


        let prettyFilter = this.getPrettyFilter()


        let viewSettingDialogProps, editDialogProps, manageColDialogProps, viewFilterDialogProps

        if (viewFilterDialog !== undefined) {

            const formFields = getFormFieldsByType(type), filterFields = {}


            columns.map(c => {
                const id = c.sortid || c.id
                if (formFields[id] && formFields[id].type !== 'Object' && formFields[id].uitype !== 'password' && this.isColumnActive(type, id)) {
                    const filterField = Object.assign({}, formFields[id])
                    filterField.fullWidth = true
                    delete filterField.tab
                    delete filterField.required
                    if (['editor', 'json'].indexOf(filterField.uitype) >= 0) {
                        filterField.uitype = 'text'
                    }

                    filterFields[id] = filterField
                }
            })

            const dateField = {
                label: 'Erstellungszeit von',
                name: '_idFrom',
                type: 'Float',
                uitype: 'datetime'
            }

            filterFields._idFrom = dateField
            filterFields._idTo = Object.assign({}, dateField, {label: 'Erstellungszeit bis', name: '_idTo'})


            Hook.call('TypesContainerBeforeFilterDialog', {type, filterFields}, this)


            let formRef
            viewFilterDialogProps = {
                title: 'Filter',
                maxWidth: 'md',
                fullWidth: true,
                open: this.state.viewFilterDialog,
                onClose: () => {
                    prettyFilter = formRef.state.fields

                    this.setState({viewFilterDialog: false}, () => {
                        const filter = this.prettyFilterToStringFilter(prettyFilter)
                        this.goTo({page: 1, prettyFilter: filter ? JSON.stringify(prettyFilter) : ''})
                    })

                },
                actions: [{
                    key: 'ok',
                    label: 'Ok',
                    type: 'primary'
                }],
                children: <div>
                    <GenericForm primaryButton={false} onRef={(e) => {
                        formRef = e
                    }} fields={filterFields} values={prettyFilter}/>
                </div>
            }
        }

        if (viewSettingDialog !== undefined) {
            viewSettingDialogProps = {
                title: _t('TypeContainer.viewSettings'),
                maxWidth: 'md',
                fullWidth: true,
                open: this.state.viewSettingDialog,
                onClose: this.handleViewSettingClose,
                actions: [{
                    key: 'ok',
                    label: 'Ok',
                    type: 'primary'
                }],
                children: <div>
                    <Typography variant="subtitle1" component="h2" gutterBottom>{_t('TypeContainer.availableColumns')}</Typography>
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
                    <Divider sx={{ mt: 2, mb: 2 }}></Divider>
                    <SimpleSwitch label={_t('TypeContainer.showTranslations')}
                                  name="translations"
                                  onChange={() => {
                                      this.settings.showTranslations = !this.settings.showTranslations
                                      this.forceUpdate()
                                  }}
                                  checked={this.settings.showTranslations}/>
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
                meta: {TypeContainer: this},
                ...(createEditDialogOption && createEditDialogOption.constructor === Object ? createEditDialogOption: {})
            }
        }

        if (manageColDialog !== undefined) {
            manageColDialogProps = {
                title: _t('TypesContainer.manageVersion'),
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
        const {description, searchOnKeyDown} = this.types[type]

        const typeSettings = this.getSettingsForType(type, this.pageParams.meta)
        let savedQueries = typeSettings.savedQueries
        if (!savedQueries) {
            savedQueries = []
        }

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

                        <Paper elevation={1}
                               component="form"
                               sx={{p: '2px 4px', display: 'flex', alignItems: 'center'}}>
                            <InputBase
                                value={this.state.filter}
                                onChange={(e) => {
                                    this.setState({filter: e.target.value})
                                    if(searchOnKeyDown!==false) {
                                        this.handleFilter({value: e.target.value, target: e.target}, false)
                                    }
                                }}
                                onKeyDown={(e) => {
                                    this.handelFilterKeyDown(e, e.target.value)
                                }}
                                sx={{ml: 1, flex: 1}}
                                placeholder={_t('TypesContainer.filter')}
                            />
                            {(this.state.filter || savedQueries.length > 0) &&
                                <SimpleMenu key="menu" mini icon={<ExpandMoreIcon/>} items={[
                                    (this.state.filter ? {
                                        name: _t('TypesContainer.saveQuery'),
                                        onClick: () => {
                                            this.setSettingsForType(type, {savedQueries: [...savedQueries,{query: this.state.filter}]})
                                        },
                                        icon: <SaveIcon/>
                                    } : null),
                                    ...(savedQueries.map(f => {
                                        return {
                                            name: f.query,
                                            actions: 22,
                                            onClick: () => {
                                                this.setState({filter: f.query})
                                                this.runFilter(f.query)
                                            }
                                        }
                                    }))
                                ]}/>
                            }
                            <IconButton onClick={() => {
                                this.setState({filter: ''})
                                this.handleFilter({value: ''}, true)
                            }} sx={{p: '10px'}}>
                                <DeleteIcon/>
                            </IconButton>
                            <Divider sx={{height: 28, m: 0.5}} orientation="vertical"/>
                            <IconButton color="primary"
                                        onClick={() => {
                                            this.setState({viewFilterDialog: true})
                                        }}
                                        sx={{p: '10px'}}>
                                <FilterListIcon/>
                            </IconButton>
                        </Paper>
                    </Col>
                </Row>
                <Typography mb={2} mt={0.5} color="text.disabled" component="div" key="searchHint"
                            variant="caption">{this.searchHint()}</Typography>

                <div style={{margin: '0 0 0.5rem 0'}}>
                    <Typography variant="caption">Filter: </Typography>
                    <Chip
                        size="small"
                        label={prettyFilter ? this.prettyFilterLabel(prettyFilter) : _t('TypesContainer.noActiveFilter')}
                        onClick={() => {
                            this.setState({viewFilterDialog: true})
                        }}
                        onDelete={prettyFilter ? () => {
                            this.goTo({page: 1, prettyFilter: ''})
                        } : null}
                        deleteIcon={<DeleteIcon/>}
                        variant="outlined"
                    />
                </div>
            </div>,
            this.renderTable(columns, typeSettings),
            <SimpleDialog key="deleteDialog" open={confirmDialog.open} onClose={this.handleConfirmDialog}
                          actions={[{key: 'yes', label: _t('core.yes')}, {
                              key: 'no',
                              label: _t('core.no'),
                              type: 'primary'
                          }]}
                          title={confirmDialog.title}>
                {confirmDialog.text}
            </SimpleDialog>,
            dataToBulkEdit &&
            <SimpleDialog fullWidth={true}
                          maxWidth="md"
                          key="bulkeditDialog"
                          open={true}
                          onClose={(action) => {
                              if (action.key === 'execute') {

                                  let data
                                  if(dataToBulkEdit.action==='editScript') {
                                      data = this.state.bulkEditScript || this.props.keyValueMap.TypesContainerBulkEdit
                                      this.props.setKeyValue({key: 'TypesContainerBulkEdit', value: data})
                                  }else {
                                      const editedDataWithRefs = referencesToIds(dataToBulkEdit.form.state.fields, type)
                                      data = JSON.stringify(editedDataWithRefs)
                                  }

                                  client.query({
                                      fetchPolicy: 'network-only',
                                      query: `query bulkEdit($collection:String!,$_id:[ID]!,$data:String!,$action:String){bulkEdit(collection:$collection,_id:$_id,data:$data,action:$action){result}}`,
                                      variables: {
                                          collection: type,
                                          _id: dataToBulkEdit.items,
                                          action: dataToBulkEdit.action,
                                          data:data
                                      }
                                  }).then(response => {
                                      if (response.data.bulkEdit) {
                                          this.setState({dataToBulkEdit:false,simpleDialog: {children: JSON.stringify(response.data.bulkEdit)}})

                                          // refresh
                                          this.getData(this.pageParams, false)


                                      }
                                  })


                              } else {
                                  this.setState({dataToBulkEdit: false})
                              }
                          }}
                          actions={[{key: 'execute', label: _t('TypesContainer.bulkEditExecute')}, {
                              key: 'cancel',
                              label: _t('core.cancel'),
                              type: 'primary'
                          }]}
                          title={_t('TypesContainer.bulkEdit')}>

                {dataToBulkEdit.action==='editScript' ? <CodeEditor lineNumbers
                            type="js"
                            onBlur={(e, bulkEditScript) => {
                                this.setState({bulkEditScript})
                            }}>{this.props.keyValueMap.TypesContainerBulkEdit}</CodeEditor> :
                    <GenericForm key="genericForm" autoFocus onRef={ref => {
                        if(ref) {
                            dataToBulkEdit.form = ref
                        }
                    }} primaryButton={false} values={dataToBulkEdit.values} fields={getFieldsForBulkEdit(type)}/>}

            </SimpleDialog>,
            confirmCloneColDialog !== undefined &&
            <SimpleDialog key="confirmClonCol" open={confirmCloneColDialog} onClose={this.handleCloneClollection}
                          actions={[{key: 'cancel', label: _t('core.cancel')}, {
                              key: 'create',
                              label: _t('TypesContainer.create'),
                              type: 'primary'
                          }]}
                          title={_t('TypesContainer.createNewVersion')}>
                <TextField fullWidth={true} value={this.state.collectionName} onChange={(e) => {
                    this.setState({collectionName: e.target.value})
                }} placeholder={_t('TypesContainer.enterVersionName')}/>

                <SimpleSwitch label={_t('TypesContainer.createEmptyVersion')}
                              onChange={(e) => {
                                  this.setState({collectionEmpty: e.target.checked})
                              }}
                              checked={this.state.collectionEmpty}/>
            </SimpleDialog>,
            simpleDialog &&
            <SimpleDialog key="simpleDialog" fullWidth={simpleDialog.fullWidth} maxWidth={simpleDialog.maxWidth} open={!!simpleDialog} onClose={simpleDialog.onClose || (() => {
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
            viewSyncDialog !== undefined && <SyncCollectionDialog entries={dataToSync} open={viewSyncDialog} onClose={()=>{
                this.setState({viewSyncDialog:false})
            }} _version={this.pageParams._version} type={type}/>,
            window.opener && this.pageParams.opener && selectedLength > 0 &&
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

        Hook.call('TypesContainerRender', {type, content,_version}, this)

        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content
    }

    searchHint() {
        const {data} = this.state
        if (data && data.meta) {
            const meta = JSON.parse(data.meta)
            return _t('TypesContainer.queryTime', meta) + (meta.debugInfo && meta.debugInfo.length > 0 ? ' - ' + meta.debugInfo.map(f=>f.message).join(' | '):'')
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

        if (s && s.columns && s.columns[id] !== undefined) {
            return s.columns[id]
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
            if (window.opener && this.pageParams.opener) {
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
        const action = e.target.value
        const {selectedRows, data} = this.state
        if (action === 'delete') {
            const dataToDelete = []
            Object.keys(selectedRows).forEach(_id => {
                dataToDelete.push({_id})
            })
            this.handleDeleteDataClick(dataToDelete)
        } else if (action === 'edit' || action === 'editScript') {
            const items = []
            Object.keys(selectedRows).forEach(_id => {
                items.push(_id)
            })
            this.setState({dataToBulkEdit:{items,action:action, values:data.results.find(entry=>entry._id===items[0])}})
        } else {

            Hook.call('TypeTableMultiSelectAction', {data, action, selectedRows}, this)
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

        const key = type + (this.pageParams.meta ? '-' + this.pageParams.meta : '')

        this.settings = deepMerge(this.settings, {[key]: {columns: {[name]: value}}})
        // force rerendering
        this.forceUpdate()
    }


    getTableColumns(type) {
        const typeDefinition = this.types[type]
        if (!typeDefinition) return

        const {data} = this.state
        const typeColumns = []

        typeColumns.push({
            label: 'Check',
            title: <Checkbox
                value=""
                checked={this.state.selectAllRows}
                onChange={this.handleRowSelect.bind(this)}
            />,
            id: 'check',
            cellStyle:{position:'sticky', zIndex:1, left:0, backgroundColor:'white', boxShadow:'inset -1px 0 0 rgb(234,234,234)'}

        })

        typeDefinition.fields.forEach(field => {
            if (!field.hidden && field.name !== 'createdBy') {
                typeColumns.push({
                    title: getFieldTitle(type, field),
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
                id: '_action',
                cellStyle:{position:'sticky', right:0, backgroundColor:'white', boxShadow:'inset 1px 0 0 rgb(234,234,234)'}
            })

        /* HOOK */
        Hook.call('TypeTableColumns', {type, data, _version: this.pageParams._version, columns: typeColumns})

        return typeColumns
    }

    determinePageParams(props) {
        const {params} = props.match || {}
        const {
            p,
            l,
            s,
            f,
            v,
            fixType,
            title,
            baseFilter,
            prettyFilter,
            includeFields,
            multi,
            meta,
            opener,
            action,
            open,
            view
        } = Util.extractQueryParams(window.location.search.substring(1))
        const pInt = parseInt(p), lInt = parseInt(l)

        const finalFixType = fixType || props.fixType,
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
            prettyFilter,
            multi,
            title,
            meta,
            opener,
            action,
            fixType: finalFixType,
            open,
            limit: lInt || typeSettings.limit || DEFAULT_RESULT_LIMIT,
            page: pInt || typeSettings.page || 1,
            sort: s || typeSettings.sort || '',
            filter: f || typeSettings.filter || '',
            view: view || typeSettings.view || '',
            _version: v || typeSettings._version || 'default',
            includeFields
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
                o[k] = {...o[k]/*, __typename: 'LocalizedString'*/}
            }
        }
    }

    extendFilter(filter) {
        const {baseFilter} = this.pageParams
        let finalFilter = (filter || '') + (baseFilter ? (filter ? ' && ' : '') + baseFilter : '')

        const prettyFilter = this.getPrettyFilter()
        if (prettyFilter) {
            if (finalFilter) {
                finalFilter += ' && '
            }
            finalFilter += this.prettyFilterToStringFilter(prettyFilter)
        }
        return finalFilter
    }

    extendSort(sort) {
        return (sort || '')
    }

    getFieldsActiveOrInactive(type, active){
        const columns = this.getTableColumns(type),
            columnsFiltered = []
        // filter: Show only the cols that are marked as active
        columns.forEach((col) => {
            if (col.id !== 'check' && col.id !== '_action' && this.isColumnActive(type, col.id) === active) {
                if (col.id === 'date') {
                    columnsFiltered.push('_id')
                } else if (col.id === '_user') {
                    columnsFiltered.push('createdBy')
                } else {
                    columnsFiltered.push(col.id)
                }
            }
        })
        return columnsFiltered
    }

    getTypeQueriesFiltered(type, opts = {}){
        const typeDefinition = this.types[type]
        let columnsFiltered = false

        if(typeDefinition && typeDefinition.onlyRequestedFields) {
            columnsFiltered = this.getFieldsActiveOrInactive(type, true)

            // special case for TypePicker opened in new window
            if(this.pageParams.includeFields){
                this.pageParams.includeFields.split(',').forEach(field=>{
                    if(columnsFiltered.indexOf(field)<0){
                        columnsFiltered.push(field)
                    }
                })
                opts.loadAll = true
            }
            typeDefinition.fields.forEach(field=>{
                if(field.alwaysLoad && columnsFiltered.indexOf(field.name)<0){
                    columnsFiltered.push(field.name)
                }
            })
            if(columnsFiltered.indexOf('_id')<0){
                columnsFiltered.push('_id')
            }
        }
        return getTypeQueries(type, columnsFiltered, opts)
    }

    setUpSubscriptions(type){
        this.removeSubscriptions()
        const subscriptionQuery = getSubscribeQuery(type)
        const qqlSubscribe = `subscription subscribe${type}{subscribe${type}{${subscriptionQuery}}}`
        const _this = this
        this.subscriptions[type] = client.subscribe({
            query: qqlSubscribe,
            variables: {}
        }).subscribe({
            next(supscriptionData) {
                const data = supscriptionData.data && supscriptionData.data[`subscribe${type}`]
                if(data){
                    if(data.action === 'update'){
                        const newStateDate = Object.assign({},_this.state.data)
                        data.data.forEach(dataEntry=>{
                            const index = newStateDate.results.findIndex(f=>f._id===dataEntry._id)
                            if(index>=0){
                                newStateDate.results[index] = Object.assign({},
                                    newStateDate.results[index],
                                    Util.removeNullValues(dataEntry, {emptyArray: true}))
                            }
                        })
                        _this.setState({data:newStateDate})
                    }
                }
            },
            error(err) {
                console.error('err', err)
            },
        })
    }

    removeSubscriptions() {
        // remove all subscriptions
        Object.keys(this.subscriptions).forEach(key => {
            this.subscriptions[key].unsubscribe()
            delete this.subscriptions[key]
        })
    }

    getData({type, page, limit, sort, filter, meta, _version}, cacheFirst, typeChanged) {

        if (type) {
            const queries = this.getTypeQueriesFiltered(type, {loadAll: false})
            if (queries) {
                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort: this.extendSort(sort), meta, _version, filter: this.extendFilter(filter)}
                if (cacheFirst) {
                    try {
                        const storeData = client.readQuery({
                            query: queries.query,
                            variables
                        })
                        if (storeData && storeData[storeKey]) {
                            // oh data are available in cache. show them first
                            setTimeout(()=>{
                                const newState = {data: Object.assign({}, storeData[storeKey])}
                                if (typeChanged) {
                                    newState.filter = filter
                                }
                                this.setState(newState)
                            },0)
                        }
                    } catch (e) {
                    }
                }

                client.query({
                    fetchPolicy: 'network-only',
                    query: queries.query,
                    variables,
                    id:'TypesContainer'
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
                }).catch(({error}) => {
                    if(error.code!==20) {
                        this.setState({data: null})
                    }
                })

                if(typeChanged || Object.keys(this.subscriptions).length===0){
                    this.setUpSubscriptions(type)
                }

            }
        }
    }

    createData(input, optimisticInput) {
        const {type, page, limit, sort, filter, meta, _version} = this.pageParams
        const user = _app_.user || {}

        if (type) {
            const queries = this.getTypeQueriesFiltered(type,  {loadAll: false})
            return client.mutate({
                mutation: queries.create,
                variables: {
                    _version,
                    ...input
                },
                update: (store, {data, error}) => {

                    if (error) {
                        return
                    }

                    if (!optimisticInput.createdBy) {
                        //
                        delete optimisticInput.createdBy
                    }
                    const freshData = {
                        ...data['create' + type],
                        createdBy: {
                            _id: user._id,
                            username: user.username,
                            __typename: 'UserPublic'
                        }, ...optimisticInput
                    }
                    this.enhanceOptimisticData(freshData)
                    console.log(freshData, optimisticInput)

                    const storeKey = this.getStoreKey(type)
                    const variables = {limit, page, sort: this.extendSort(sort), meta, _version, filter: this.extendFilter(filter)}

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
            const queries = this.getTypeQueriesFiltered(type,  {loadAll: false})
            return client.mutate({
                mutation: queries.update,
                /* only send what has changed*/
                variables: {_version, ...changedData},
                update: (store, {data}) => {
                    const storeKey = this.getStoreKey(type),
                        responseItem = data['update' + type]
                    const variables = {limit, page, sort:  this.extendSort(sort), meta, _version, filter: this.extendFilter(filter)}
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: queries.query,
                        variables
                    })

                    if (storeData && storeData[storeKey] && responseItem) {
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

            const queries = this.getTypeQueriesFiltered(type, {loadAll: false}),
                storeKey = this.getStoreKey(type)
            client.mutate({
                mutation: (ids.length > 1 ? queries.deleteMany : queries.delete),
                variables: {
                    _version,
                    _id: ids.length > 1 ? ids : ids[0]
                },
                update: (store, {data}) => {
                    const variables = {limit, page, sort: this.extendSort(sort), meta, _version, filter: this.extendFilter(filter)}
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
                                if(result) {
                                    const idx = refResults.findIndex(x => x._id === result._id)
                                    if (idx > -1) {
                                        if (result.status === 'deleting') {
                                            refResults[idx] = {...refResults[idx], status: 'deleting'}
                                        } else {
                                            refResults.splice(idx, 1)
                                            newData.total -= 1
                                        }
                                    }
                                }
                            })
                        }

                        store.writeQuery({
                            query: queries.query,
                            variables,
                            data: {...storeData, [storeKey]: newData}
                        })

                        if (newData && newData.results && newData.results.length === 0) {
                            this.getData(this.pageParams, false)
                        }
                        this.setState({data: newData})

                    }

                },
            })
        }
    }


    cloneData(clonable, optimisticData) {
        const {type, page, limit, sort, filter, meta, _version} = this.pageParams

        const user = _app_.user || {}

        if (type) {

            const queries = this.getTypeQueriesFiltered(type, {loadAll: false}),
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
                            _id: user._id,
                            username: user.username
                        }
                    }

                    const storeKey = this.getStoreKey(type)

                    const variables = {limit, page, sort: this.extendSort(sort), meta, _version, filter: this.extendFilter(filter)}
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

    cloneCollection({type, name, empty}) {
        if (type) {
            client.mutate({
                mutation: `mutation cloneCollection($type:String!,$name:String,$empty:Boolean){cloneCollection(type:$type,name:$name,empty:$empty){collection{name}}}`,
                variables: {name, type, empty},
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
        const {
            type,
            page,
            limit,
            sort,
            filter,
            fixType,
            _version,
            multi,
            baseFilter,
            title,
            meta,
            opener,
            prettyFilter,
            includeFields,
            view
        } = Object.assign({}, this.pageParams, args)

        this.props.history.push(`${baseUrl ? baseUrl : ADMIN_BASE_URL + '/' + (location.pathname.indexOf('/typesblank/') >= 0 ? 'typesblank' : 'types') + (type ? '/' + type : '')}?p=${page}&l=${limit}&s=${sort}&f=${encodeURIComponent(filter)}&v=${_version}${fixType ? '&fixType=' + fixType : ''}${includeFields ? '&includeFields=' + includeFields : ''}${title ? '&title=' + encodeURIComponent(title) : ''}${meta ? '&meta=' + meta : ''}${multi ? '&multi=' + multi : ''}${baseFilter ? '&baseFilter=' + encodeURIComponent(baseFilter) : ''}${prettyFilter ? '&prettyFilter=' + encodeURIComponent(prettyFilter) : ''}${opener?'&opener=true':''}${view?'&view='+view:''}`)
    }

    getPrettyFilter() {
        let prettyFilter = parseOrElse(this.pageParams.prettyFilter,{})
        if(Object.keys(prettyFilter).length===0){
            return false
        }
        return prettyFilter
    }

    prettyFilterToStringFilter(prettyFilter) {
        let newFilter = ''

        Object.keys(prettyFilter).forEach(fieldKey => {
            if (!fieldKey.startsWith('__operator.data.')) {
                const value = prettyFilter[fieldKey]
                if (value) {
                    if (fieldKey === '_idFrom' || fieldKey === '_idTo') {

                        if (newFilter) {
                            newFilter += ' && '
                        }
                        newFilter += `_id${fieldKey === '_idTo' ? '<=' : '>='}${Math.floor(value / 1000).toString(16) + '0000000000000000'}`

                    } else if (Array.isArray(value)) {
                        if (value.length > 0) {

                            let idsOrString = []
                            value.forEach(item => {
                                idsOrString.push(item._id || item)
                            })
                            if (newFilter) {
                                newFilter += ' && '
                            }
                            newFilter += `${fieldKey}==[${idsOrString.join(',')}]`
                        }
                    } else if (value.constructor === Object) {

                        const operator = prettyFilter['__operator.' + fieldKey] || '='
                        Object.keys(value).forEach(key => {

                            if (newFilter) {
                                newFilter += ' && '
                            }
                            newFilter += `${fieldKey}.${key}${operator}${value[key]}`
                        })

                    } else {

                        const operator = prettyFilter['__operator.' + fieldKey] || '='
                        if (newFilter) {
                            newFilter += ' && '
                        }
                        newFilter += `${fieldKey}${operator}${value}`
                    }
                }
            }
        })
        return newFilter
    }

    prettyFilterLabel(prettyFilter) {
        const {type} = this.pageParams
        let newFilter = []

        let payload = {prettyFilter}

        Hook.call('TypesContainerBeforeFilterLabel', {type: this.pageParams.type, payload}, this)

        const getValues = (data) => {
            let str = ''
            const keys = Object.keys(data)
            for (let i = 0; i < Math.min(keys.length, 3); i++) {
                if (str) {
                    str += ' '
                }
                str += data[keys[i]]
            }
            return str
        }
        const typeDefinition = this.types[type]
        Object.keys(payload.prettyFilter).forEach(fieldKey => {
            if (!fieldKey.startsWith('__operator.')) {
                const value = payload.prettyFilter[fieldKey]
                if (value) {
                    if (newFilter.length > 0) {
                        newFilter.push(<span> und </span>)
                    }
                    if (fieldKey === '_idFrom' || fieldKey === '_idTo') {

                        newFilter.push(<span>Erstellungszeit{fieldKey === '_idTo' ? '<=' : '>='}</span>)

                        newFilter.push(<strong>{Util.formatDate(value)}</strong>)
                    } else {
                        const operator = payload.prettyFilter['__operator.' + fieldKey] || '='

                        let fieldName = fieldKey
                        if(typeDefinition?.fields){
                            const field = typeDefinition.fields.find(f=>f.name===fieldKey)
                            if(field){
                                fieldName = getFieldTitle(type,field)
                            }
                        }
                        newFilter.push(<span>{fieldName}{operator}</span>)
                        if (Array.isArray(value)) {
                            if (value.length > 0) {
                                value.forEach(item => {
                                    newFilter.push(<strong>{item.data ? item.data.name || getValues(item.data) : item.name ?? item.username ?? item}</strong>)
                                })
                            }
                        } else if (value.constructor === Object) {

                            newFilter.push(<strong>{getValues(value)}</strong>)
                        } else {

                            newFilter.push(<strong>{value}</strong>)
                        }
                    }
                }
            }
        })
        return newFilter
    }

    runFilter(f) {
        const {type} = this.pageParams
        this.setSettingsForType(type, {filter: f})
        this.goTo({page: 1, filter: f, prettyFilter: undefined})
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
            this.props.history.push(`${ADMIN_BASE_URL}/${location.pathname.indexOf('/typesblank/') >= 0 ? 'typesblank' : 'types'}/${v}`)
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


    handleDeleteDataClick = (dataToDelete) => {
        this.setState({confirmDialog: {
                action:'deleteEntries',
                open:true,
                title:_t('TypesContainer.deleteConfirmTitle'),
                payload: dataToDelete,
                text:dataToDelete.length > 1 ? _t('TypesContainer.deleteConfirmTextMulti') : _t('TypesContainer.deleteConfirmText')}})
    }

    handleSyncClick = (data) => {
        this.setState({viewSyncDialog: true, dataToSync: [data]})
    }

    handleEditDataClick = (data) => {

        //load missing data if needed
        const {type, _version} = this.pageParams

        const typeDefinition = this.types[type]
        const typeData = this.types[type]
        let fieldsToLoad = []

        if(typeDefinition.onlyRequestedFields){
            fieldsToLoad= this.getFieldsActiveOrInactive(type,false)
        }

        typeData.fields.forEach(field => {
            if (field.alwaysLoad === false && fieldsToLoad.indexOf(field.name)<0) {
                fieldsToLoad.push(field.name)
            }
        })


        const variables = {_version, filter: '_id=' + data._id}

        Hook.call('TypeTableBeforeEdit', {type, data, variables, fieldsToLoad})

        if (fieldsToLoad.length > 0) {

            const queries = getTypeQueries(type, fieldsToLoad)
            client.query({
                fetchPolicy: 'network-only',
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
            if(field.clone !== undefined) {
                if (field.clone.constructor === String ) {
                    if(!field.localized) {
                        const tpl = new Function(DomUtil.toES5('const {' + Object.keys(data).join(',') + '} = this.data;return `' + field.clone + '`;'))
                        newData[field.name] = tpl.call({data})
                    }
                }else{
                    newData[field.name] = field.clone
                }
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

    handleConfirmDialog = (action) => {
        const {confirmDialog} = this.state
        if(action) {
            if (confirmDialog.action === 'deleteEntries' && action.key === 'yes') {
                this.deleteData(this.pageParams, confirmDialog.payload.reduce((acc, item) => {
                    acc.push(item._id)
                    return acc
                }, []))
            } else {
                Hook.call('TypeContainerConfirmDialog', {type: this.pageParams.type, confirmDialog, action}, this)
            }
        }
        this.setState({confirmDialog: {open:false}, selectAllRows: false, selectedRows: {}})
    }

    handleCloneClollection = (action) => {
        if (action && action.key === 'create') {
            const {type} = this.pageParams
            this.cloneCollection({type, name: this.state.collectionName, empty: this.state.collectionEmpty})
        }
        this.setState({confirmCloneColDialog: false, collectionName: ''})
    }


    handleCreateEditData = (action) => {
        this.setState({createEditDialog: false, createEditDialogOption: null, dataToEdit: null})
    }

    handleViewSettingClose = (action) => {
        this.setState({viewSettingDialog: false})
        const {type} = this.pageParams
        const typeDefinition = this.types[type]
        if(typeDefinition.onlyRequestedFields) {
            this.getData(this.pageParams, true)
        }
    }

    handleViewCollectionClose = (action) => {
        this.setState({manageColDialog: false})
    }
}

TypesContainer.propTypes = {
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    fixType: PropTypes.string,
    baseUrl: PropTypes.string,
    baseFilter: PropTypes.string,
    settings: PropTypes.object,
    title: PropTypes.any,
    onRef: PropTypes.func,
    /* To get and set settings */
    setKeyValue: PropTypes.func.isRequired,
    keyValueMap: PropTypes.object
}

export default withKeyValues(TypesContainer, ['TypesContainerSettings', 'TypesContainerBulkEdit'])
