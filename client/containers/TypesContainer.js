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
    SimpleMenu
} from 'ui/admin'
import {withApollo, Query} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import Util from 'client/util'
import GenericForm from 'client/components/GenericForm'
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

const {ADMIN_BASE_URL, LANGUAGES, DEFAULT_RESULT_LIMIT} = config
import {COLLECTIONS_QUERY} from '../constants'

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
    }
})


class TypesContainer extends React.Component {

    // default labels can be repalced
    labels = {searchPlaceholder: 'Filter expression (for specifc fields use field=term)'}

    types = null
    pageParams = null
    createEditForm = null
    typeColumns = {}
    typesToSelect = []
    settings = {}
    searchFields = {
        term: {
            autoFocus: true,
            uitype: 'search',
            fullWidth: true,
            placeholder: this.labels.searchPlaceholder
        }
    }
    fixType = null
    noLayout = false

    constructor(props) {
        super(props)

        this.parseSettings(props)

        this.types = getTypes()
        this.pageParams = this.determinPageParams(props)
        this.baseFilter = props.baseFilter

        // store on object instance to preserve value when url change
        this.noLayout = this.pageParams.noLayout
        this.fixType = this.pageParams.fixType

        this.state = {
            selectAllRows: false,
            selectedrows: {},
            confirmDeletionDialog: true,
            viewSettingDialog: undefined,
            manageColDialog: undefined,
            confirmCloneColDialog: undefined,
            dataToDelete: null,
            createEditDialog: undefined,
            createEditDialogOption: null,
            dataToEdit: null,
            data: null,
            collectionName: ''
        }

        if (!this.fixType) {
            // if it is not a fix type a selection box with all types is shown
            // prepare list with types for select box
            Object.keys(this.types).map((k) => {
                const t = this.types[k]
                this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
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
            console.log('save settings')
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
        return this.state !== state ||
            this.state.selectedrows !== state.selectedrows ||
            this.props.location !== props.location ||
            this.props.baseFilter !== props.baseFilter ||
            this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings
    }

    UNSAFE_componentWillReceiveProps(props) {
        const change = this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings
        if (change) {
            this._filterForm = null
            this.parseSettings(props)
        }

        const pageParams = this.determinPageParams(props)

        if (this.props.settings !== props.settings) {
            this._lastData = null
        }


        if (change ||
            this.props.settings !== props.settings ||
            this.props.baseFilter !== props.baseFilter ||
            this.pageParams.type !== pageParams.type ||
            this.pageParams.page !== pageParams.page ||
            this.pageParams._version !== pageParams._version ||
            this.pageParams.limit !== pageParams.limit ||
            this.pageParams.sort !== pageParams.sort ||
            this.pageParams.filter !== pageParams.filter) {
            this.pageParams = pageParams
            this.baseFilter = props.baseFilter
            this.getData(pageParams, true)
        }
    }


    renderTable(columns) {
        const {classes} = this.props
        const {data, selectedrows} = this.state
        if (data) {

            // small optimization. only render table if data changed
            if (data === this._lastData && selectedrows === this._lastSelectedRows) {
                return this._renderedTable
            }

            this._lastData = data
            this._lastSelectedRows = selectedrows

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
                                            contentEditable>{fieldValue && fieldValue[lang]}</span>
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
                                                 suppressContentEditableWarning contentEditable>{fieldValue}</div>
                                    }
                                }


                            }
                        }
                    })

                    if (columnsMap['_user']) {
                        dynamic._user = (item.createdBy ? item.createdBy.username : '???')
                    }
                    if (columnsMap['date']) {
                        dynamic.date = <span><span>{Util.formattedDateFromObjectId(item._id)}</span><br/><small>{item._id}</small></span>
                    }
                    if (columnsMap['_action']) {

                        const entryActions = [{
                            name: 'Delete entry',
                            disabled: (item.status == 'deleting' || item.status == 'updating'),
                            onClick: this.handleDeleteDataClick.bind(this, item),
                            icon: <DeleteIcon/>
                        }, {
                            name: 'Edit entry',
                            disabled: (item.status == 'deleting' || item.status == 'updating'),
                            onClick: this.handleEditDataClick.bind(this, item),
                            icon: <EditIcon/>
                        }]

                        if (this.types[type].entryClonable) {
                            entryActions.push(
                                {
                                    name: 'Clone entry',
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
                    name: 'Add new ' + type, onClick: () => {
                        setTimeout(() => {
                            this.setState({createEditDialog: true})
                        }, 0)

                    }
                }, {
                    name: 'View settings', onClick: () => {
                        this.setState({viewSettingDialog: true})
                    }
                }, {
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
                                             const {type, page, limit, sort, filter} = this.pageParams
                                             this.goTo(type, page, limit, sort, filter, e.target.value)
                                             this.setSettingsForType(type, {_version: e.target.value})
                                         }}
                                         items={items}
                                     />
                                 }}
                             </Query>
                             }
                             actions={actions}
                             footer={<div>{`${selectedLength} rows selected`} {selectedLength ? <SimpleSelect
                                 label="Select action"
                                 value=""
                                 onChange={this.handleBatchAction.bind(this)}
                                 items={[{name: 'Delete', value: 'delete'}]}
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
        const {dataToEdit, createEditDialog, viewSettingDialog, confirmCloneColDialog, manageColDialog, dataToDelete, confirmDeletionDialog} = this.state
        const {title, client} = this.props
        const {type, filter} = this.pageParams
        const formFields = getFormFields(type), columns = this.getTableColumns(type)

        this.searchFields.term.value = filter

        if (!this.types[type]) {
            return <BaseLayout><Typography variant="subtitle1" color="error">Type {type} does not
                exist.
                Types can be specified in an extension. Please select another type.</Typography><SimpleSelect
                value={type}
                onChange={this.handleTypeChange}
                items={this.typesToSelect}
            /></BaseLayout>
        }


        let viewSettingDialogProps, editDialogProps, manageColDialogProps

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

        const {description} = this.types[type]
        const content = [
            title === false ? '' :
                <Typography key="typeTitle" variant="h3"
                            gutterBottom>{title || (this.fixType ? this.fixType : 'Types')}</Typography>,
            description ?
                <Typography key="typeDescription" variant="subtitle1" gutterBottom>{description}</Typography> : '',
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
                    <GenericForm key="searchType"
                                 autoFocus={true}
                                 onChange={this.handleFilter}
                                 onKeyDown={this.handelFilterKeyDown}
                                 primaryButton={false}
                                 updatekey={type}
                                 fields={this.searchFields}/>
                </Col>
            </Row>,
            this.renderTable(columns),
            dataToDelete &&
            <SimpleDialog key="deleteDialog" open={confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                          title="Confirm deletion">
                Are you sure you want to delete {dataToDelete.length > 1 ? 'the selected items' : 'this item'}?
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
            createEditDialog !== undefined && <TypeEdit key="editDialog" {...editDialogProps}/>,
            viewSettingDialog !== undefined && <SimpleDialog key="settingDialog" {...viewSettingDialogProps}/>,
            manageColDialog !== undefined && <SimpleDialog key="collectionDialog" {...manageColDialogProps}/>
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
        this.setState({selectedrows, selectAllRows})

    }

    handleViewSettingChange(e, type) {
        const target = e.target, value = target.checked, name = target.name
        this.settings = deepMerge(this.settings, {[type]: {columns: {[name]: value}}})
        // force rerendering
        this._lastData = null
        this.forceUpdate()
    }


    getTableColumns(type) {
        const typeDefinition = this.types[type]
        if (!typeDefinition) return

        const {selectAllRows} = this.state

        if (this.typeColumns[type] && this._lastSelectAllRows === selectAllRows) return this.typeColumns[type]
        this.typeColumns[type] = []
        this._lastSelectAllRows = selectAllRows

        this.typeColumns[type].push({
            label: 'Check',
            title: <Checkbox
                checked={this.state.selectAllRows}
                onChange={this.handleRowSelect.bind(this)}
            />,
            id: 'check'
        })

        typeDefinition.fields.forEach(field => {
            if (!field.hidden && field.name !== 'createdBy') {
                this.typeColumns[type].push({
                    title: (field.label || field.name) + (field.localized ? ' [' + _app_.lang + ']' : ''),
                    id: field.name,
                    sortable: true
                })
            }
        })

        if (!typeDefinition.noUserRelation) {
            this.typeColumns[type].push({
                title: 'User',
                id: '_user'
            })
        }
        this.typeColumns[type].push(
            {
                title: 'Created at / id',
                id: 'date',
                sortid: '_id',
                sortable: true
            },
            {
                title: 'Actions',
                id: '_action'
            })

        /* HOOK */
        Hook.call('TypeTableColumns', {type, _version: this.pageParams._version, columns: this.typeColumns[type]})

        return this.typeColumns[type]
    }

    determinPageParams(props) {
        const {params} = props.match
        const {p, l, s, f, v, noLayout, fixType} = Util.extractQueryParams(window.location.search.substring(1))
        const pInt = parseInt(p), lInt = parseInt(l)

        const finalFixType = fixType || props.fixType,
            finalNoLayout = noLayout || props.noLayout

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
        const formFields = getFormFields(this.pageParams.type)
        for (let k in o) {
            if (o[k] && formFields[k] && formFields[k].localized) {
                o[k].__typename = 'LocalizedString'
            }
        }
    }

    extendFilter(filter) {
        return filter + (this.baseFilter ? (filter ? ' && ' : '') + this.baseFilter : '')
    }

    getData({type, page, limit, sort, filter, _version}, cacheFirst) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)

            if (queries) {

                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, _version, filter: this.extendFilter(filter)},
                    gqlQuery = gql(queries.query)
                let hasStoreError = false
                if (cacheFirst) {
                    try {
                        const storeData = client.readQuery({
                            query: gqlQuery,
                            variables
                        })
                        if (storeData && storeData[storeKey]) {
                            // oh data are available in cache. show them first
                            this.setState({data: storeData[storeKey]})
                        }
                    } catch (e) {
                        hasStoreError = true
                    }
                }
                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    query: gqlQuery,
                    variables
                }).then(response => {
                    const o = response.data[storeKey]
                    if (!this.state.data || hasStoreError || JSON.stringify(this.state.data) !== JSON.stringify(o)) {
                        this.setState({data: o})
                    }
                }).catch(error => {
                    console.log(error.message)
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
                        if (!storeData[storeKey].results) {
                            storeData[storeKey].results = []
                        }

                        if (freshData) {
                            storeData[storeKey].results.unshift(freshData)
                            storeData[storeKey].total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables,
                            data: storeData
                        })
                        this.setState({data: storeData[storeKey]})
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
                        const refResults = storeData[storeKey].results
                        const idx = refResults.findIndex(x => x._id === responseItem._id)

                        if (idx > -1) {
                            // update entry with new data
                            refResults[idx] = deepMerge({}, refResults[idx], changedData, optimisticData)
                            this.enhanceOptimisticData(refResults[idx])
                            // wirte it back to the cache
                            store.writeQuery({
                                query: gqlQuery,
                                variables,
                                data: storeData
                            })
                            this.setState({data: storeData[storeKey]})
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
                        const refResults = storeData[storeKey].results

                        const items = ids.length > 1 ? data['delete' + type + 's'] : [data['delete' + type]]
                        items.forEach(result => {
                            const idx = refResults.findIndex(x => x._id === result._id)
                            if (idx > -1) {
                                if (result.status === 'deleting') {
                                    refResults[idx].status = 'deleting'
                                } else {
                                    refResults.splice(idx, 1)
                                    storeData[storeKey].total -= 1
                                }
                            }
                        })

                        store.writeQuery({
                            query: gqlQuery,
                            variables,
                            data: storeData
                        })
                        this.setState({data: storeData[storeKey]})

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
                    const variables = {page, limit, sort, _version, filter: extendedFilter}

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables
                    })
                    if (storeData[storeKey]) {

                        if (freshData) {
                            storeData[storeKey].results.unshift(freshData)
                            storeData[storeKey].total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables,
                            data: storeData
                        })
                        this.setState({data: storeData[storeKey]})
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
                            storeData.collections.results.push(data.cloneCollection.collection)
                            store.writeQuery({
                                query: gqlCollectionsQuery,
                                variables,
                                data: storeData
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

    goTo(type, page, limit, sort, filter, _version) {
        const {baseUrl} = this.props
        this.props.history.push(`${baseUrl ? baseUrl : ADMIN_BASE_URL}${this.fixType ? '' : '/types/' + type}?p=${page}&l=${limit}&s=${sort}&f=${encodeURIComponent(filter)}&v=${_version}`)
    }


    runFilter(f) {
        const {type, limit, sort, _version} = this.pageParams
        this.setSettingsForType(type, {filter: f})
        this.goTo(type, 1, limit, sort, f, _version)
    }

    handleFilterTimeout = null
    handleFilter = ({value}, immediate) => {
        clearTimeout(this.handleFilterTimeout)
        if (immediate) {
            this.runFilter(value)
        } else {
            this.handleFilterTimeout = setTimeout(() => {
                this.runFilter(value)
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
        const {type, limit, sort, filter, _version} = this.pageParams
        const aSort = sort.split(' ')
        let orderDirection = 'desc'
        if (aSort.length > 1 && orderBy === aSort[0] && orderDirection === aSort[1]) {
            orderDirection = 'asc'
        }
        const newSort = `${orderBy} ${orderDirection}`
        this.setSettingsForType(type, {sort: newSort})
        this.goTo(type, 1, limit, newSort, filter, _version)
    }


    handleTypeChange = event => {
        const v = event.target.value
        if (v !== this.pageParams.type) {
            this.settings.lastType = v
            this.saveSettings()
            this.props.history.push(`${ADMIN_BASE_URL}/types/${v}`)
        }
    }

    handleChangePage = (page) => {
        const {type, limit, sort, filter, _version} = this.pageParams
        this.goTo(type, page, limit, sort, filter, _version)
    }


    handleChangeRowsPerPage = (limit) => {
        const {type, sort, filter, _version} = this.pageParams
        this.goTo(type, 1, limit, sort, filter, _version)
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
            addAlwaysUpdateData(data, changedData, data.__typename)
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
            if (field.clone) {
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
)(withApollo(withStyles(styles)(withKeyValues(TypesContainer, ['TypesContainerSettings']))))
