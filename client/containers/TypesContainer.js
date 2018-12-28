import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import ManageCollectionClones from '../components/types/ManageCollectionClones'
import {
    FileCopyIconButton,
    WebIconButton,
    DeleteIconButton,
    EditIconButton,
    Checkbox,
    Chip,
    Typography,
    Switch,
    MenuItem,
    SimpleSelect,
    TextField,
    Input,
    SimpleDialog,
    SimpleTable,
    Row,
    Col,
    Tooltip,
    SimpleSwitch,
} from 'ui/admin'
import FileDrop from 'client/components/FileDrop'
import {withApollo, Query} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import Util from 'client/util'
import GenericForm from 'client/components/generic/GenericForm'
import config from 'gen/config'
import Hook from 'util/hook'
import {getTypes, getTypeQueries, getFormFields} from 'util/types'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {getImageTag} from 'client/util/media'
import {withStyles} from '@material-ui/core/styles'
import {deepMerge}  from 'util/deepMerge'
const {ADMIN_BASE_URL, UPLOAD_URL, LANGUAGES, DEFAULT_RESULT_LIMIT} = config
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
    }
})


class TypesContainer extends React.Component {

    types = null
    pageParams = null
    createEditForm = null
    typeColumns = {}
    typesToSelect = []
    settings = {}

    constructor(props) {
        super(props)
        this.parseSettings(props)

        this.types = getTypes()
        this.pageParams = this.determinPageParams(props)
        this.baseFilter = props.baseFilter
        this.state = {
            selectAllRows: false,
            selectedrows: {},
            confirmDeletionDialog: true,
            viewSettingDialog: undefined,
            manageColDialog: undefined,
            confirmCloneColDialog: undefined,
            dataToDelete: null,
            createEditDialog: undefined,
            dataToEdit: null,
            data: null,
            collectionName: ''
        }


        // prepare list with types for select box
        Object.keys(this.types).map((k) => {
            const t = this.types[k]
            this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
        })
    }

    parseSettings(props) {
        try {
            this.settings = JSON.parse(props.keyValueMap.TypesContainerSettings)
        } catch (e) {
            this.settings = {}
        }
    }

    setSettingsForType(type, settings) {
        this.settings[type] = Object.assign({}, this.settings[type], settings)
    }

    componentWillUnmount() {
        const value = JSON.stringify(this.settings)
        if (value !== this.props.keyValueMap.TypesContainerSettings) {
            console.log('save settings')
            this.props.setKeyValue({key: 'TypesContainerSettings', value})
        }
    }

    componentDidMount() {
        this.getData(this.pageParams, true)
        if (this.props.onRef)
            this.props.onRef(this)
    }

    shouldComponentUpdate(props, state) {
        // maybe this can be optimized even more
        return this.state !== state ||
            this.state.selectedrows !== state.selectedrows ||
            this.props.location !== props.location ||
            this.props.baseFilter !== props.baseFilter ||
            this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings
    }

    UNSAFE_componentWillReceiveProps(props) {
        const pageParams = this.determinPageParams(props)

        if (this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings) {
            this.parseSettings(props)
        }

        if (this.props.settings !== props.settings ||
            this.props.baseFilter !== props.baseFilter ||
            this.pageParams.type !== pageParams.type ||
            this.pageParams.page !== pageParams.page ||
            this.pageParams.version !== pageParams.version ||
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

            const {type, page, limit, sort, version} = this.pageParams
            const fields = this.types[type].fields, dataSource = []

            const columnsFiltered = [], columnsMap = {}

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
                        dynamic.check = <Checkbox
                            checked={!!selectedrows[item._id]}
                            onChange={this.handleRowSelect.bind(this)}
                            value={item._id}
                        />
                    }
                    fields.forEach(field => {
                        if (columnsMap[field.name]) {
                            let v = item[field.name]
                            if (field.reference) {
                                if (v) {
                                    if (v.constructor === Array) {
                                        if (field.type === 'Media') {
                                            dynamic[field.name] = v.reduce((s, i) => {
                                                s.push(getImageTag(i._id, {key: i._id, height: 40}))
                                                return s
                                            }, [])
                                        } else {
                                            dynamic[field.name] = v.reduce((s, i) => s + (s !== '' ? ', ' : '') + i.name, '')
                                        }


                                    } else {
                                        if (field.type === 'Media') {
                                            dynamic[field.name] = getImageTag(v._id, {height: 40})
                                        } else {
                                            dynamic[field.name] = v.name
                                        }
                                    }
                                }
                            } else if (field.type === 'Boolean') {
                                dynamic[field.name] = <Switch name={field.name}
                                                              onChange={e => this.handleDataChange.bind(this)(e, item, field.name)}
                                                              checked={!!v}/>
                            } else if (field.uitype === 'image') {
                                dynamic[field.name] =
                                    <img style={{height: '40px'}}
                                         src={v}/>
                            } else if (field.uitype === 'datetime') {
                                dynamic[field.name] = Util.formattedDatetime(v)
                            } else {
                                if (field.localized) {
                                    const localizedNames = item[field.name + '_localized'],
                                        langVar = []

                                    LANGUAGES.map(lang => {

                                        langVar.push(<div key={lang} className={classes.tableContent}>
                                        <span
                                            className={classes.textLight}>{lang}:</span> <span
                                            onBlur={e => this.handleDataChange.bind(this)(e, item, field.name + '_localized.' + lang)}
                                            suppressContentEditableWarning
                                            contentEditable>{localizedNames && localizedNames[lang]}</span>
                                            <br />
                                        </div>)
                                    })
                                    dynamic[field.name] = langVar
                                } else {
                                    dynamic[field.name] =
                                        <div className={classes.tableLargeContent}
                                             onBlur={e => this.handleDataChange.bind(this)(e, item, field.name)}
                                             suppressContentEditableWarning contentEditable>{v}</div>
                                }


                            }
                        }
                    })

                    if (columnsMap['user']) {
                        dynamic.user = (item.createdBy ? item.createdBy.username : '???')
                    }
                    if (columnsMap['date']) {
                        dynamic.date = Util.formattedDateFromObjectId(item._id)
                    }
                    if (columnsMap['action']) {
                        dynamic.action = [
                            <Tooltip key="deleteBtn" placement="top" title="Delete entry">
                                <DeleteIconButton disabled={(item.status == 'deleting' || item.status == 'updating')}
                                                  onClick={this.handleDeleteDataClick.bind(this, item)}/>
                            </Tooltip>,
                            <Tooltip key="editBtn" placement="top" title="Edit entry">
                                <EditIconButton
                                    disabled={(item.status == 'deleting' || item.status == 'updating')}
                                    onClick={this.handleEditDataClick.bind(this, item)}/>
                            </Tooltip>
                        ]

                        if (this.types[type].entryClonable) {
                            dynamic.action.push(<Tooltip key="copyBtn" placement="top" title="Clone entry">
                                <FileCopyIconButton
                                    disabled={(item.status == 'deleting' || item.status == 'updating')}
                                    onClick={this.handleCopyClick.bind(this, item, fields)}/>
                            </Tooltip>)
                        }
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
                    }, 300)

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


                        //TODO implement
                    }
                })
            }
            this._renderedTable =
                <SimpleTable key="typeTable" title={type} dataSource={dataSource} columns={columnsFiltered}
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
                                         value={version}
                                         onChange={(e) => {

                                             const {type, page, limit, sort, filter} = this.pageParams
                                             this.goTo(type, page, limit, sort, filter, e.target.value)
                                             this.setSettingsForType(type, {version: e.target.value})

                                             //this.setState({selectedVersion:e.target.value})
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
        const {fixType, noLayout, title} = this.props
        const {type, filter} = this.pageParams
        const formFields = getFormFields(type), columns = this.getTableColumns(type)

        if (!this.types[type]) return <BaseLayout><Typography variant="subtitle1" color="error">Type {type} does not
            exist.
            Types can be specified in an extension.</Typography></BaseLayout>


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
                        return <div key={c.id}><SimpleSwitch label={c.label || c.title} name={c.id}
                                                             onChange={(e) => {
                                                                 this.handleViewSettingChange.bind(this)(e, type)
                                                             }}
                                                             checked={ this.isColumnActive(type, c.id) }/></div>
                    })
                    }
                </div>
            }
        }

        if (createEditDialog !== undefined) {
            editDialogProps = {
                title: type,
                open: this.state.createEditDialog,
                onClose: this.handleCreateEditData,
                actions: [{key: 'cancel', label: 'Cancel'}, {
                    key: 'save',
                    label: 'Save',
                    type: 'primary'
                }],
                children: <GenericForm autoFocus innerRef={ref => {
                    this.createEditForm = ref
                }} onChange={field => {
                    Hook.call('TypeCreateEditDialogChange', {field, type, props: editDialogProps, dataToEdit}, this)
                }} primaryButton={false} fields={formFields} values={dataToEdit}/>
            }
            /* HOOK */
            Hook.call('TypeCreateEditDialog', {type, props: editDialogProps, dataToEdit}, this)
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
                <Typography key="typeTitle" variant="h3" gutterBottom>{fixType ? fixType : 'Types'}</Typography>,
            description ?
                <Typography key="typeDescription" variant="subtitle1" gutterBottom>{description}</Typography> : '',
            <Row spacing={16} key="typeHeader">
                {!fixType &&
                <Col md={9}>
                    <SimpleSelect
                        value={type}
                        onChange={this.handleTypeChange}
                        items={this.typesToSelect}
                    />
                </Col>
                }
                <Col xs={12} md={(fixType ? 12 : 3)} align="right">
                    <GenericForm onChange={this.handleFilter}
                                 onKeyDown={this.handelFilterKeyDown}
                                 primaryButton={false}
                                 fields={{
                                     term: {
                                         value: filter,
                                         fullWidth: true,
                                         placeholder: 'Filter expression (for specifc fields use field=term)'
                                     }
                                 }}/>
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
            createEditDialog !== undefined && <SimpleDialog key="editDialog" {...editDialogProps}/>,
            viewSettingDialog !== undefined && <SimpleDialog key="settingDialog" {...viewSettingDialogProps}/>,
            manageColDialog !== undefined && <SimpleDialog key="collectionDialog" {...manageColDialogProps}/>
        ]

        Hook.call('TypesContainerRender', {type, content}, this)

        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        if (noLayout) {
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
                delete selectedrows[value];
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
            if (field.name !== 'createdBy') {
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
                id: 'user'
            })
        }
        this.typeColumns[type].push(
            {
                title: 'Created at',
                id: 'date',
                sortid: '_id',
                sortable: true
            },
            {
                title: 'Actions',
                id: 'action'
            })

        /* HOOK */
        Hook.call('TypeTableColumns', {type, version: this.pageParams.version, columns: this.typeColumns[type]})

        return this.typeColumns[type]
    }

    determinPageParams(props) {
        const {params} = props.match
        const {p, l, s, f, v} = Util.extractQueryParams(window.location.search.substring(1))
        const pInt = parseInt(p), lInt = parseInt(l)
        let type
        if (props.fixType) {
            type = props.fixType
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
            limit: lInt || typeSettings.limit || DEFAULT_RESULT_LIMIT,
            page: pInt || typeSettings.page || 1,
            sort: s || typeSettings.sort || '',
            filter: f || typeSettings.filter || '',
            version: v || typeSettings.version || 'default'
        }
        result.type = type
        return result
    }

    getStoreKey(type) {
        return type.charAt(0).toLowerCase() + type.slice(1) + 's'
    }

    enhanceOptimisticData(o) {
        for (let k in o) {
            if (o[k] && k.endsWith('_localized')) {
                o[k].__typename = 'LocalizedString'
                LANGUAGES.forEach(l => {
                    if (!o[k][l]) o[k][l] = ''
                })
            }
        }
    }

    extendFilter(filter) {
        return filter + (this.baseFilter ? (filter ? ' && ' : '') + this.baseFilter : '')
    }

    getData({type, page, limit, sort, filter, version}, cacheFirst) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)

            if (queries) {

                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, version, filter: this.extendFilter(filter)},
                    gqlQuery = gql(queries.query)
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
                    }
                }
                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    query: gqlQuery,
                    variables
                }).then(response => {
                    this.setState({data: response.data[storeKey]})
                }).catch(error => {
                    console.log(error.message)
                    this.setState({data: null})
                })

            }
        }
    }

    createData({type, page, limit, sort, filter, version}, input, optimisticInput) {
        const {client, user} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            return client.mutate({
                mutation: gql(queries.create),
                variables: {
                    _version: version,
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

                    const variables = {page, limit, sort, version, filter: extendedFilter}

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

    updateData({type, page, limit, sort, filter, version}, changedData, optimisticData) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            return client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: {_version: version, ...changedData},
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type),
                        responseItem = data['update' + type]

                    const extendedFilter = this.extendFilter(filter)

                    const variables = {page, limit, sort, version, filter: extendedFilter}
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


    deleteData({type, page, limit, sort, filter, version}, ids) {
        const {client} = this.props

        if (type && ids.length > 0) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)
            client.mutate({
                mutation: gql(ids.length > 1 ? queries.deleteMany : queries.delete),
                variables: {
                    _version: version,
                    _id: ids.length > 1 ? ids : ids[0]
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)
                    const extendedFilter = this.extendFilter(filter)

                    const variables = {page, limit, sort, version, filter: extendedFilter}
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


    cloneData({type, page, limit, sort, filter, version}, clonable) {
        const {client, user} = this.props

        if (type) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)

            client.mutate({
                mutation: gql(queries.clone),
                variables: {_version: version, ...clonable},
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
                    const variables = {page, limit, sort, version, filter: extendedFilter}

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
                mutation: gql(`mutation cloneCollection($type:String!,$name:String){cloneCollection(type:$type,name:$name){collection{name}}}`),
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

    goTo(type, page, limit, sort, filter, version) {
        const {baseUrl, fixType} = this.props
        this.props.history.push(`${baseUrl ? baseUrl : ADMIN_BASE_URL}${fixType ? '' : '/types/' + type + '/'}?p=${page}&l=${limit}&s=${sort}&f=${encodeURIComponent(filter)}&v=${version}`)
    }


    runFilter(f) {
        const {type, limit, sort, version} = this.pageParams
        this.goTo(type, 1, limit, sort, f, version)
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
        const {type, limit, sort, filter, version} = this.pageParams
        const aSort = sort.split(' ')
        let orderDirection = 'desc'
        if (aSort.length > 1 && orderBy === aSort[0] && orderDirection === aSort[1]) {
            orderDirection = 'asc'
        }
        const newSort = `${orderBy} ${orderDirection}`
        this.setSettingsForType(type, {sort: newSort})
        this.goTo(type, 1, limit, newSort, filter, version)
    }


    handleTypeChange = event => {
        const v = event.target.value
        if (v !== this.pageParams.type) {
            this.settings.lastType = v
            this.props.history.push(`${ADMIN_BASE_URL}/types/${v}`)
        }
    }

    handleChangePage = (page) => {
        const {type, limit, sort, filter, version} = this.pageParams
        this.goTo(type, page, limit, sort, filter, version)
    }


    handleChangeRowsPerPage = (limit) => {
        const {type, sort, filter, version} = this.pageParams
        this.goTo(type, 1, limit, sort, filter, version)
    }


    referencesToIds = (input) => {

        const formFields = getFormFields(this.pageParams.type)
        // make sure if it is a reference only id gets passed as imput to craeteData
        const ipt2 = {}
        Object.keys(input).map(k => {
            const item = input[k]

            if (item !== undefined) {
                if (k.endsWith('_localized')) {
                    ipt2[k] = item
                    if (item) {
                        delete ipt2[k].__typename //= 'LocalizedStringInput'
                        // set default language for validation as it might be required
                        const keyBase = k.substring(0, k.length - 10)
                        if (!ipt2[keyBase]) {
                            ipt2[keyBase] = item[_app_.lang]
                        }
                    }
                } else if (item && item.constructor === Array) {

                    if (item.length > 0) {
                        const {multi} = formFields[k]

                        if (multi) {
                            ipt2[k] = item.map(i => i._id)
                        } else {
                            ipt2[k] = item[0]._id
                        }
                    } else {
                        ipt2[k] = null
                    }
                } else if (item && item.constructor === Object) {
                    ipt2[k] = item._id
                } else {
                    ipt2[k] = item
                }
            }
        })
        return ipt2
    }

    handleDataChange = (event, data, key) => {
        let value

        if (event.target.type === 'checkbox') {
            value = event.target.checked
        } else {
            value = event.target.innerText.trim()
        }

        const parts = key.split('.')
        if (parts.length === 2) {
            // localized.de
            key = parts[0]
            value = {[parts[1]]: value}
        }

        if (value !== data[key]) {
            this.updateData(this.pageParams, {_id: data._id, [key]: value})
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
                const tpl = new Function('const {' + Object.keys(data).join(',') + '} = this.data;return `' + field.clone + '`;')
                newData[field.name] = tpl.call({data})
            }
        })
        this.cloneData(this.pageParams, {_id: data._id, ...newData})
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            this.deleteData(this.pageParams, this.state.dataToDelete.reduce((acc, item) => {
                acc.push(item._id);
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

        const closeModal = () => {
            this.setState({createEditDialog: false, dataToEdit: null})
        }

        if (action && action.key === 'save') {

            if (!this.createEditForm.validate()) {
                return
            }

            const fieldData = Object.assign({}, this.createEditForm.state.fields)
            const formFields = getFormFields(this.pageParams.type)

            // convert array to single value for not multivalue references
            Object.keys(formFields).forEach(key => {
                const field = formFields[key]
                if (field.reference && !field.multi && fieldData[key] && fieldData[key].length) {
                    fieldData[key] = fieldData[key][0]
                }
            })

            const submitData = this.referencesToIds(fieldData)
            const callback = ({errors}) => {
                // server side validation
                if (errors && errors.length) {
                    const fieldErrors = {}
                    errors.forEach(e => {
                        if (e.state) {
                            Object.keys(e.state).forEach(k => {
                                fieldErrors[k.substring(0, k.length - 5)] = e.state[k]
                            })
                        }
                    })
                    if (Object.keys(fieldErrors).length) {
                        this.createEditForm.setState({fieldErrors})
                    }
                } else {
                    closeModal()
                }
            }

            if (this.state.dataToEdit) {
                // if dataToEdit is set we are in edit mode
                const updateData = {}
                Object.keys(submitData).forEach(k => {
                    const before = this.state.dataToEdit[k]
                    if (before && before.constructor === Object) {
                        if (before._id !== submitData[k]) {
                            updateData[k] = submitData[k]
                        }
                    } else if (submitData[k] !== before) {
                        updateData[k] = submitData[k]
                    }
                })
                if (Object.keys(updateData).length) {
                    // only send data if they have really changed
                    this.updateData(this.pageParams, {_id: this.state.dataToEdit._id, ...updateData}, fieldData).then(callback)
                } else {
                    closeModal()
                }

            } else {
                // create a new entry
                this.createData(this.pageParams, submitData, fieldData).then(callback)
            }

        } else if (action && action.key === 'cancel') {
            closeModal()
        } else {
            Hook.call('TypeCreateEditDialogAction', {type: this.pageParams.type, closeModal, action}, this)
        }
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


// add an extra column for Media at the beginning
Hook.on('TypeTableColumns', ({type, columns}) => {
    if (type === 'Media') {
        columns.splice(1, 0, {title: 'Data', id: 'data'})
    }
})

// add some extra data to the table
Hook.on('TypeTable', ({type, dataSource, data, container}) => {
    if (type === 'Media') {
        dataSource.forEach((d, i) => {
            const item = data.results[i]
            const mimeType = item.mimeType ? item.mimeType.split('/') : ['file']

            d.data = <a target="_blank" rel="noopener noreferrer" href={UPLOAD_URL + '/' + item._id}>
                {
                    (mimeType[0] === 'image' ?
                            <img height="40" src={UPLOAD_URL + '/' + item._id}/>
                            :
                            <div className="file-icon" data-type={mimeType.length > 1 ? mimeType[1] : 'doc'}></div>
                    )
                }
            </a>
        })
    } else if (type === 'CmsPage') {
        dataSource.forEach((d, i) => {
            if (d.action) {

                d.action.push(<Tooltip key="viewBtn" placement="top" title="View page">
                    <WebIconButton onClick={() => {
                        const {version} = container.pageParams
                        container.props.history.push('/' + (version && version !== 'default' ? '@' + version + '/' : '') + data.results[i].slug)
                    }}/>
                </Tooltip>)
            }
        })
    }
})

// add some extra data to the table
Hook.on('TypeCreateEditDialog', function ({type, props, dataToEdit}) {
    if (type === 'Media' && !dataToEdit) {
        // remove save button
        props.actions.splice(1, 1)
        props.children =
            <FileDrop multi={false} accept="*/*" uploadTo="/graphql/upload" resizeImages={true} onSuccess={r => {
                this.setState({createEditDialog: false})

                this.getData(this.pageParams, false)
                // TODO: but it directly into the store instead of reload
                //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


            }}/>
    }
})

