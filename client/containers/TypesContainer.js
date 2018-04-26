import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import {
    ContentCopyIconButton,
    WebIconButton,
    DeleteIconButton,
    EditIconButton,
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
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import Util from 'client/util'
import GenericForm from 'client/components/generic/GenericForm'
import config from 'gen/config'
import Hook from 'util/hook'
import {getTypes, getTypeQueries, getFormFields} from 'util/types'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {getImageTag} from 'client/util/media'
import {withStyles} from 'material-ui/styles'
import {deepMerge}  from 'util/deepMerge'
const DEFAULT_RESULT_LIMIT = 10
const {ADMIN_BASE_URL, UPLOAD_URL, LANGUAGES} = config


const styles = theme => ({
    textLight: {
        color: 'rgba(0,0,0,0.4)'
    },
    tableContent: {
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 150
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
        this.state = {
            confirmDeletionDialog: true,
            viewSettingDialog: undefined,
            dataToDelete: null,
            createEditDialog: undefined,
            dataToEdit: null,
            data: null
        }


        // prepare list with types for select box
        Object.keys(this.types).map((k) => {
            const t = this.types[k]
            this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
        })
    }

    parseSettings(props) {
        const {onSettings} = props
        try {
            this.settings = JSON.parse(props.keyValueMap.TypesContainerSettings)
        } catch (e) {
            this.settings = {}
        }
        if (onSettings)
            onSettings(this.settings)
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
            this.props.location !== props.location ||
            this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings
    }

    componentWillReceiveProps(props) {
        const pageParams = this.determinPageParams(props)

        if (this.props.keyValueMap.TypesContainerSettings !== props.keyValueMap.TypesContainerSettings) {
            this.parseSettings(props)
        }

        if (this.pageParams.type !== pageParams.type || this.pageParams.page !== pageParams.page || this.pageParams.limit !== pageParams.limit || this.pageParams.sort !== pageParams.sort || this.pageParams.filter !== pageParams.filter) {
            this.pageParams = pageParams
            this.getData(pageParams, true)
        }
    }


    renderTable(columns) {
        const {classes} = this.props
        const {data} = this.state

        if (data) {

            // small optimization. only render table if data changed
            if (data === this._lastData) {
                return this._renderedTable
            }

            this._lastData = data

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
                    const dynamic = {}
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
                                        <span onBlur={e => this.handleDataChange.bind(this)(e, item, field.name)}
                                              suppressContentEditableWarning contentEditable>{v}</span>
                                }


                            }
                        }
                    })

                    if (columnsMap['user']) {
                        dynamic.user = item.createdBy.username
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
                            </Tooltip>,
                            <Tooltip key="copyBtn" placement="top" title="Clone entry">
                                <ContentCopyIconButton
                                    disabled={(item.status == 'deleting' || item.status == 'updating')}
                                    onClick={this.handleCopyClick.bind(this, item)}/>
                            </Tooltip>
                        ]
                    }
                    dataSource.push(dynamic)
                })

            }
            const asort = sort.split(' ')

            /* HOOK */
            Hook.call('TypeTable', {type, dataSource, data, fields, container: this})

            this._renderedTable =
                <SimpleTable title={type} dataSource={dataSource} columns={columnsFiltered} count={data.total}
                             rowsPerPage={limit} page={page}
                             orderBy={asort[0]}
                             actions={[
                                 {
                                     name: 'Add new ' + type, onClick: () => {
                                     this.setState({createEditDialog: true})
                                 }
                                 }, {
                                     name: 'View settings', onClick: () => {
                                         this.setState({viewSettingDialog: true})
                                     }
                                 }, {
                                     name: 'Refresh', onClick: () => {
                                         this.getData(this.pageParams, false)
                                     }
                                 }]}
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
        const {dataToEdit, createEditDialog, viewSettingDialog} = this.state
        const {fixType, noLayout, title} = this.props
        const {type, filter} = this.pageParams
        const formFields = getFormFields(type), columns = this.getTableColumns(type)

        if (!this.types[type]) return <BaseLayout><Typography variant="subheading" color="error">Type {type} does not
            exist.
            Types can be specified in an extension.</Typography></BaseLayout>


        let viewSettingDialogProps, editDialogProps

        if( viewSettingDialog !== undefined ) {
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
                        return <div key={c.id}><SimpleSwitch label={c.title} name={c.id}
                                                             onChange={(e) => {
                                                                 this.handleViewSettingChange.bind(this)(e, type)
                                                             }}
                                                             checked={ this.isColumnActive(type, c.id) }/></div>
                    })
                    }
                </div>
            }
        }

        if( createEditDialog !== undefined ) {
            editDialogProps = {
                title: type,
                open: this.state.createEditDialog,
                onClose: this.handleCreateEditData,
                actions: [{key: 'cancel', label: 'Cancel'}, {
                    key: 'save',
                    label: 'Save',
                    type: 'primary'
                }],
                children: <GenericForm ref={ref => {
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
                <Col md={(fixType ? 12 : 3)} align="right">
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
        if (this.settings[type] && this.settings[type].columns) {
            return this.settings[type].columns[id] === undefined || this.settings[type].columns[id]
        }
        return true
    }

    handleViewSettingChange(e, type) {
        const target = e.target
        const value = target.checked
        const name = target.name
        this.settings = deepMerge(this.settings, {[type]: {columns: {[name]: value}}})

        // force rerendering
        this._lastData = null
        this.forceUpdate()
    }


    getTableColumns(type) {
        if (this.typeColumns[type]) return this.typeColumns[type]
        this.typeColumns[type] = []
        this.types[type].fields.forEach(field => {
            this.typeColumns[type].push({
                title: field.name + (field.localized ? ' [' + _app_.lang + ']' : ''),
                id: field.name,
                sortable: true
            })
        })
        this.typeColumns[type].push({
                title: 'User',
                id: 'user'
            },
            {
                title: 'Created at',
                id: 'date'
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

    getData({type, page, limit, sort, filter}, cacheFirst) {
        const {client, baseFilter} = this.props
        if (type) {
            const queries = getTypeQueries(type)

            if (queries) {

                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, filter: filter + (baseFilter?(filter?' && ':'')+baseFilter:'')},
                    gqlQuery = gql(queries.query)
console.log(variables)
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
            client.mutate({
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

                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
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
                            variables: {page, limit, sort, filter},
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
            client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: changedData,
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type),
                        responseItem = data['update' + type]

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
                    })


                    if (storeData[storeKey]) {
                        // find entry in result list
                        const refResults = storeData[storeKey].results
                        const idx = refResults.findIndex(x => x._id === responseItem._id)

                        if (idx > -1) {
                            // update entry with new data
                            refResults[idx] = deepMerge({}, refResults[idx], changedData, optimisticData)

                            // wirte it back to the cache
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {page, limit, sort, filter},
                                data: storeData
                            })
                            this.setState({data: storeData[storeKey]})
                        }
                    }

                },
            })
        }
    }


    deleteData({type, page, limit, sort, filter}, id) {
        const {client} = this.props

        if (type) {

            const queries = getTypeQueries(type),
                storeKey = this.getStoreKey(type)

            client.mutate({
                mutation: gql(queries.delete),
                variables: {
                    _id: id
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
                    })

                    if (storeData[storeKey]) {
                        const refResults = storeData[storeKey].results

                        const idx = refResults.findIndex(x => x._id === data['delete' + type]._id)
                        if (idx > -1) {
                            if (data['delete' + type].status === 'deleting') {
                                refResults[idx].status = 'deleting'
                            } else {
                                refResults.splice(idx, 1)
                                storeData[storeKey].total -= 1
                            }
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {page, limit, sort, filter},
                                data: storeData
                            })
                            this.setState({data: storeData[storeKey]})
                        }
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
                    console.log(data)
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
            }, 1000)
        }

    }

    handelFilterKeyDown = (e, value) => {
        if (e.key === "Enter") {
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
        this.setState({confirmDeletionDialog: true, dataToDelete: data})
    }

    handleEditDataClick = (data) => {
        this.setState({createEditDialog: true, dataToEdit: data})
    }

    handleCopyClick = (data) => {
        this.cloneData(this.pageParams, {_id: data._id, slug: data.slug + ' copy'})
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            this.deleteData(this.pageParams, this.state.dataToDelete._id)
        }
        this.setState({confirmDeletionDialog: false, dataToDelete: false})
    }


    handleCreateEditData = (action) => {
        if (action && action.key === 'save') {

            const fieldData = this.createEditForm.state.fields
            const submitData = this.referencesToIds(fieldData)

            if (this.state.dataToEdit) {
                // if dataToEdit is set we are in edit mode
                this.updateData(this.pageParams, {_id: this.state.dataToEdit._id, ...submitData}, fieldData)
            } else {
                // create a new entry
                this.createData(this.pageParams, submitData, fieldData)
            }

        }
        this.setState({createEditDialog: false, dataToEdit: null})
    }

    handleViewSettingClose = (action) => {
        if (action && action.key === 'save') {


        }
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
    title: PropTypes.any,
    onSettings: PropTypes.func,
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
        columns.unshift({title: "Data", id: "data"})
    }
})

// add some extra data to the table
Hook.on('TypeTable', ({type, dataSource, data, container}) => {
    if (type === 'Media') {
        dataSource.forEach((d, i) => {
            d.data = <img height="40" src={UPLOAD_URL + '/' + data.results[i]._id}/>
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
        props.children = <FileDrop multi={false} onSuccess={r => {
            this.setState({createEditDialog: false})

            this.getData(this.pageParams, false)
            // todo: but it directly into the store instead of reload
            //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


        }}/>
    }
})

