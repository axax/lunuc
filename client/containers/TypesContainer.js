import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
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
    SimpleSwitch
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

const gqlCollectionsQuery = gql`query collections($filter:String){collections(filter:$filter){results{name}}}`

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
            dataToDelete: null,
            createEditDialog: undefined,
            dataToEdit: null,
            data: null,
            selectedVersion: 'default'
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

        if (this.props.settings !== props.settings || this.props.baseFilter !== props.baseFilter || this.pageParams.type !== pageParams.type || this.pageParams.page !== pageParams.page || this.pageParams.limit !== pageParams.limit || this.pageParams.sort !== pageParams.sort || this.pageParams.filter !== pageParams.filter) {
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

            const {type, page, limit, sort} = this.pageParams

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
                    name: 'Clone collection', onClick: () => {
                        this.cloneCollection(this.pageParams)
                    }
                })
            }
            this._renderedTable =
                <SimpleTable title={type} dataSource={dataSource} columns={columnsFiltered} count={data.total}
                             rowsPerPage={limit} page={page}
                             orderBy={asort[0]}
                             header={this.types[type].collectionClonable &&
                                 <Query query={gqlCollectionsQuery}
                                        fetchPolicy="cache-and-network"
                                        variables={{filter: '^' + type + '_.*'}}>
                                     {({loading, error, data}) => {
                                         if (loading) return "Loading..."
                                         if (error) return `Error! ${error.message}`

                                         const items = data.collections.results.reduce((a, c) => {
                                             a.push({value: c.name, name: c.name.substring(c.name.indexOf('_') + 1)});
                                             return a;
                                         }, [])
                                         items.unshift({value: 'default', name: 'Default'})
                                         return <SimpleSelect
                                             label="Current version"
                                             value={this.state.selectedVersion}
                                             onChange={() => {
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
        const {dataToEdit, createEditDialog, viewSettingDialog, dataToDelete, confirmDeletionDialog} = this.state
        const {fixType, noLayout, title} = this.props
        const {type, filter} = this.pageParams
        const formFields = getFormFields(type), columns = this.getTableColumns(type)

        if (!this.types[type]) return <BaseLayout><Typography variant="subheading" color="error">Type {type} does not
            exist.
            Types can be specified in an extension.</Typography></BaseLayout>


        let viewSettingDialogProps, editDialogProps

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
                    <Typography variant="caption" component="h2" gutterBottom>Available columns</Typography>

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
                children: <GenericForm autoFocus ref={ref => {
                    this.createEditForm = ref
                }} primaryButton={false} fields={formFields} values={dataToEdit}/>
            }
            /* HOOK */
            Hook.call('TypeCreateEditDialog', {type, props: editDialogProps, dataToEdit}, this)
        }


        const content = <div>
            {title === false ? '' :
                <Typography variant="display2" gutterBottom>{fixType ? fixType : 'Types'}</Typography>}

            <Row spacing={16}>
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
            </Row>

            {this.renderTable(columns)}

            {dataToDelete &&
            <SimpleDialog open={confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                          title="Confirm deletion">
                Are you sure you want to delete {dataToDelete.length > 1 ? 'the selected items' : 'this item'}?
            </SimpleDialog>
            }

            {createEditDialog !== undefined && <SimpleDialog {...editDialogProps}/> }
            {viewSettingDialog !== undefined && <SimpleDialog {...viewSettingDialogProps}/> }
        </div>

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
            this.setState({dataToDelete})

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
                    title: field.name + (field.localized ? ' [' + _app_.lang + ']' : ''),
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
        Hook.call('TypeTableColumns', {type, columns: this.typeColumns[type]})

        return this.typeColumns[type]
    }

    determinPageParams(props) {
        const {params} = props.match
        const {p, l, s, f} = Util.extractQueryParams(window.location.search.substring(1))
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
            filter: f || typeSettings.filter || ''
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

    getData({type, page, limit, sort, filter}, cacheFirst) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)

            if (queries) {

                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, filter: this.extendFilter(filter)},
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

    createData({type, page, limit, sort, filter}, input, optimisticInput) {
        const {client, user} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            return client.mutate({
                mutation: gql(queries.create),
                variables: {
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

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter: extendedFilter}
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
                            variables: {page, limit, sort, filter: extendedFilter},
                            data: storeData
                        })
                        this.setState({data: storeData[storeKey]})
                    }

                },
            })
        }
    }

    updateData({type, page, limit, sort, filter}, changedData, optimisticData) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)
            return client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: changedData,
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type),
                        responseItem = data['update' + type]

                    const extendedFilter = this.extendFilter(filter)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter: extendedFilter}
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
                                variables: {page, limit, sort, filter: extendedFilter},
                                data: storeData
                            })
                            this.setState({data: storeData[storeKey]})
                        }
                    }

                }
            })
        }
    }


    deleteData({type, page, limit, sort, filter}, ids) {
        const {client} = this.props

        if (type) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)
            client.mutate({
                mutation: gql(queries.deleteMany),
                variables: {
                    _id: ids
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)
                    const extendedFilter = this.extendFilter(filter)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter: extendedFilter}
                    })
                    if (storeData[storeKey]) {
                        const refResults = storeData[storeKey].results

                        data['delete' + type + 's'].forEach(result => {
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
                            variables: {page, limit, sort, filter: extendedFilter},
                            data: storeData
                        })
                        this.setState({data: storeData[storeKey]})

                    }

                },
            })
        }
    }


    cloneData({type, page, limit, sort, filter}, variables) {
        const {client, user} = this.props

        if (type) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)

            client.mutate({
                mutation: gql(queries.clone),
                variables,
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

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
                    })
                    if (storeData[storeKey]) {

                        if (freshData) {
                            storeData[storeKey].results.unshift(freshData)
                            storeData[storeKey].total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables: {page, limit, sort, filter},
                            data: storeData
                        })
                        this.setState({data: storeData[storeKey]})
                    }

                },
            })
        }
    }

    cloneCollection({type}) {
        if (type) {
            const {client} = this.props
            client.mutate({
                mutation: gql(`mutation cloneCollection($name:String!){cloneCollection(name:$name){collection{name}}}`),
                variables: {name: type},
                update: (store, {data}) => {
                    console.log(data)
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

    goTo(type, page, limit, sort, filter) {
        const {baseUrl, fixType} = this.props
        this.props.history.push(`${baseUrl ? baseUrl : ADMIN_BASE_URL}${fixType ? '' : '/types/' + type + '/'}?p=${page}&l=${limit}&s=${sort}&f=${encodeURIComponent(filter)}`)
    }


    runFilter(f) {
        const {type, limit, sort} = this.pageParams
        this.goTo(type, 1, limit, sort, f)
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
        const {type, limit, sort, filter} = this.pageParams
        const aSort = sort.split(' ')
        let orderDirection = 'desc'
        if (aSort.length > 1 && orderBy === aSort[0] && orderDirection === aSort[1]) {
            orderDirection = 'asc'
        }
        const newSort = `${orderBy} ${orderDirection}`
        this.setSettingsForType(type, {sort: newSort})
        this.goTo(type, 1, limit, newSort, filter)
    }


    handleTypeChange = event => {
        const v = event.target.value
        if (v !== this.pageParams.type) {
            this.settings.lastType = v
            this.props.history.push(`${ADMIN_BASE_URL}/types/${v}`)
        }
    }

    handleChangePage = (page) => {
        const {type, limit, sort, filter} = this.pageParams
        this.goTo(type, page, limit, sort, filter)
    }


    handleChangeRowsPerPage = (limit) => {
        const {type, sort, filter} = this.pageParams
        this.goTo(type, 1, limit, sort, filter)
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
        this.setState({confirmDeletionDialog: false, dataToDelete: false})
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

        } else {
            closeModal()
        }
    }

    handleViewSettingClose = (action) => {
        this.setState({viewSettingDialog: false})
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
                        container.props.history.push('/' + data.results[i].slug)
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

