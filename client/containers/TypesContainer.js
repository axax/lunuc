import React from 'react'
import PropTypes from 'prop-types'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {
    DeleteIconButton,
    Chip,
    Typography,
    MenuItem,
    SimpleSelect,
    TextField,
    Input,
    SimpleDialog,
    SimpleTable,
    SimpleMenu,
    Row,
    Col
} from 'ui/admin'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import Util from 'client/util'
import GenericForm from 'client/components/generic/GenericForm'
import {withRouter} from 'react-router-dom'
import {ADMIN_BASE_URL} from 'gen/config'
import Hook from 'util/hook'

const DEFAULT_RESULT_LIMIT = 10

class TypesContainer extends React.Component {

    types = null
    queries = {}
    pageParams = null
    createEditForm = null
    typeFormFields = {}
    typeColumns = {}
    typesToSelect = []

    constructor(props) {
        super(props)
        this.types = prepareTypes()

        this.pageParams = this.determinPageParams(props)
        const {type, page, limit, sort} = this.pageParams
        this.state = {
            confirmDeletionDialog: true,
            dataToBeDeleted: null,
            createDataDialog: false
        }

        // prepare list with types for select box
        Object.keys(this.types).map((k) => {
            const t = this.types[k]
            this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
        })

    }

    componentDidMount() {
        this.getData(this.pageParams)
    }


    componentWillReceiveProps(props) {
        const pageParams = this.determinPageParams(props)

        if (this.pageParams.type !== pageParams.type || this.pageParams.page !== pageParams.page || this.pageParams.limit !== pageParams.limit || this.pageParams.sort !== pageParams.sort || this.pageParams.filter !== pageParams.filter) {
            this.pageParams = pageParams
            this.getData(pageParams)
        }
    }


    render() {
        const startTime = new Date()
        const {data} = this.state
        const {type, page, limit, sort, filter} = this.pageParams
        const formFields = this.getFormFields(type)

        if (!this.types[type]) return <BaseLayout><Typography type="subheading" color="error">Type {type} does not
            exist.
            Types can be specified in an extension.</Typography></BaseLayout>

        let tableWithResults
        if (data) {

            const fields = this.types[type].fields, columns = this.getTableColumns(type), dataSource = []

            if (data.results) {
                data.results.forEach(item => {
                    const dynamic = {}
                    fields.forEach(field => {
                        let v = item[field.name]
                        if( v === null || v=== undefined){
                            dynamic[field.name] = ''
                        }else if (field.reference) {
                            if( v.constructor === Array ){
                                dynamic[field.name] = v.reduce((s,i)=>s+(s!==''?', ':'')+i.name,'')
                            }else{
                                dynamic[field.name] = v.name
                            }
                        } else if (field.uitype === 'image') {
                            dynamic[field.name] =
                                <img style={{height: '40px'}}
                                     src={'http://localhost:8080/build/uploads/' + v}/>
                        } else {
                            dynamic[field.name] =
                                <span onBlur={(e) => this.handleDataChange.bind(this)(e, item, field.name)}
                                      suppressContentEditableWarning contentEditable>{v}</span>
                        }
                    })
                    dataSource.push({
                        ...dynamic,
                        user: item.createdBy.username,
                        date: Util.formattedDateFromObjectId(item._id),
                        action: <div>

                            <DeleteIconButton disabled={(item.status == 'deleting' || item.status == 'updating')}
                                              onClick={this.handleDeleteDataClick.bind(this, item)}>Delete</DeleteIconButton>
                        </div>
                    })
                })
            }
            const asort = sort.split(' ')
            tableWithResults =
                <SimpleTable className="demooo" dataSource={dataSource} columns={columns} count={data.total}
                             rowsPerPage={parseInt(limit)} page={page}
                             orderBy={asort[0]}
                             orderDirection={asort.length > 1 && asort[1] || null}
                             onSort={this.handleSortChange}
                             onChangePage={this.handleChangePage.bind(this)}
                             onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>
        }


        const content = <BaseLayout>
            <Typography type="display2" gutterBottom>Types</Typography>

            <Row spacing={16}>
                <Col md={9}>
                    <SimpleSelect
                        value={type}
                        onChange={this.handleTypeChange}
                        items={this.typesToSelect}
                    />
                </Col>
                <Col md={3} align="right">
                    <SimpleMenu items={[{
                        name: 'Add new ' + type, onClick: () => {
                            this.setState({createDataDialog: true})
                        }
                    }]}/>
                </Col>
            </Row>


            <Row spacing={16}>
                <Col md={9} sm={12} xs={12}>
                    <GenericForm caption="Add" fields={formFields}
                                 onClick={this.handleAddDataClick}/>
                </Col>
                <Col md={3} sm={12} xs={12}>
                    <GenericForm onChange={this.handleFilter} primaryButton={false}
                                 fields={{
                                     term: {
                                         value: filter,
                                         fullWidth: true,
                                         placeholder: 'Filter expression (for specifc fields use field=term)'
                                     }
                                 }}/>
                </Col>
            </Row>

            {tableWithResults}

            <Typography type="display1" component="h2" gutterBottom>Available fields</Typography>

            {type &&
            this.types[type].fields.map(field => {
                return <Chip key={field.name} label={field.name}/>
            })
            }

            {this.state.dataToBeDeleted &&
            <SimpleDialog open={this.state.confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                          title="Confirm deletion">
                Are you sure you want to delete this item?
            </SimpleDialog>
            }

            { <SimpleDialog open={this.state.createDataDialog} onClose={this.handleCreateEditData}
                            actions={[{key: 'cancel', label: 'Cancel'}, {
                                key: 'save',
                                label: 'Save',
                                type: 'primary'
                            }]}
                            title={type}>


                <GenericForm ref={ref => {
                    this.createEditForm = ref
                }} primaryButton={false} fields={formFields}/>

            </SimpleDialog>
            }
        </BaseLayout>

        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content
    }


    getFormFields(type) {
        if (this.typeFormFields[type]) return this.typeFormFields[type]

        this.typeFormFields[type] = {}
        this.types[type].fields.map(field => {
            let uitype = field.uitype
            // if uitype is not defined and if it is a reference to another type use type_picker
            if (!uitype && field.reference) {
                uitype = 'type_picker'
            }
            this.typeFormFields[type][field.name] = {
                placeholder: `Enter ${field.name}`,
                uitype,
                multi: !!field.multi,
                type: field.type
            }
        })

        return this.typeFormFields[type]
    }

    getTableColumns(type) {
        if (this.typeColumns[type]) return this.typeColumns[type]

        this.typeColumns[type] = []
        this.types[type].fields.forEach(field => {
            this.typeColumns[type].push({title: field.name, dataIndex: field.name, sortable: true})
        })
        this.typeColumns[type].push({
                title: 'User',
                dataIndex: 'user'
            },
            {
                title: 'Created at',
                dataIndex: 'date'
            },
            {
                title: 'Actions',
                dataIndex: 'action'
            })
        return this.typeColumns[type]
    }

    determinPageParams(props) {
        const {params} = props.match
        const {p, l, s, f} = Util.extractQueryParams(window.location.search.substring(1))
        const result = {limit: l || DEFAULT_RESULT_LIMIT, page: p || 1, sort: s || '', filter: f || ''}
        if (params.type) {
            result.type = params.type
        } else {
            for (const prop in this.types) {
                result.type = prop
                break
            }
        }

        return result
    }

    getQueries(type) {
        if (!this.queries[type])
            this.queries[type] = buildQueries(type, this.types)
        return this.queries[type]
    }

    getStoreKey(type) {
        return type.charAt(0).toLowerCase() + type.slice(1) + 's'
    }

    getData({type, page, limit, sort, filter}) {
        const {client} = this.props
        if (type) {
            const queries = this.getQueries(type)

            if (queries) {
                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, filter},
                    gqlQuery = gql(queries.query)
                try {
                    const storeData = client.readQuery({
                        query: gqlQuery,
                        variables: variables
                    })
                    if (storeData && storeData[storeKey]) {
                        // oh data are available in cache. show them first
                        this.setState({data: storeData[storeKey]})
                    }
                } catch (e) {
                }


                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    query: gqlQuery,
                    variables: variables
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
        const {client} = this.props
        if (type) {
            const queries = this.getQueries(type)

            client.mutate({
                mutation: gql(queries.create),
                variables: {
                    ...input
                },
                update: (store, {data}) => {
                    console.log('create', data['create' + type])

                    const freshData = {...data['create' + type],...optimisticInput}

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

    updateData({type, page, limit, sort, filter}, input, key) {
        const {client} = this.props

        if (type) {

            const queries = this.getQueries(type)

            client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: {
                    _id: input._id,
                    [key]: input[key]
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query),
                        storeKey = this.getStoreKey(type)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
                    })


                    if (storeData[storeKey]) {
                        const refResults = storeData[storeKey].results

                        const idx = refResults.findIndex(x => x._id === data['update' + type]._id)
                        if (idx > -1) {
                            refResults[idx] = Object.assign({}, refResults[idx], Util.removeNullValues(input))
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

            const queries = this.getQueries(type),
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


    handleFilterTimeout = null
    handleFilter = ({value}) => {
        clearTimeout(this.handleFilterTimeout)
        this.handleFilterTimeout = setTimeout(() => {
            const {type, limit, sort} = this.pageParams
            this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${sort}&f=${value}`)
        }, 1000)
    }

    handleSortChange = (e, orderBy) => {
        const {type, limit, sort, filter} = this.pageParams

        const aSort = sort.split(' ')
        let orderDirection = 'desc'
        if (aSort.length > 1 && orderBy === aSort[0] && orderDirection === aSort[1]) {
            orderDirection = 'asc'
        }
        const newSort = `${orderBy} ${orderDirection}`

        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${newSort}&f=${filter}`)
    }


    handleTypeChange = event => {
        if (event.target.value !== this.pageParams.type) {
            this.props.history.push(`${ADMIN_BASE_URL}/types/${event.target.value}`)
        }
    }

    handleChangePage = (page) => {
        const {type, limit, sort, filter} = this.pageParams
        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=${page}&l=${limit}&s=${sort}&f=${filter}`)
    }


    handleChangeRowsPerPage = (limit) => {
        const {type, sort, filter} = this.pageParams
        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${sort}&f=${filter}`)
    }


    handleAddDataClick = (input) => {

        // make sure if it is a reference only id gets passed as imput to craeteData
        const ipt2 = {}
        Object.keys(input).map(k => {
            const item = input[k]
            const {multi} = this.typeFormFields[this.pageParams.type][k]
            if (item && item.constructor === Array) {
                if (item.length > 0) {
                    if (multi) {
                        ipt2[k] = item.map(i => i._id)
                    } else {
                        ipt2[k] = item[0]._id
                    }
                } else {
                    ipt2[k] = null
                }
            } else {
                ipt2[k] = item
            }
        })
        this.createData(this.pageParams, ipt2, input)
    }

    handleDataChange = (event, data, key) => {
        const t = event.target.innerText.trim()
        if (t !== data[key]) {
            this.updateData(this.pageParams, {...data, [key]: t}, key)
        }
    }

    handleDeleteDataClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToBeDeleted: data})
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            this.deleteData(this.pageParams, this.state.dataToBeDeleted._id)
        }
        this.setState({confirmDeletionDialog: false, dataToBeDeleted: false})
    }


    handleCreateEditData = (action) => {
        if (action && action.key === 'save') {
            this.handleAddDataClick(this.createEditForm.state.fields)
        }
        this.setState({createDataDialog: false})
    }
}

TypesContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired
}

export default withRouter(withApollo(TypesContainer))


const buildQueries = (typeName, types) => {
    if (!typeName || !types[typeName]) return null

    const result = {}

    const {name, fields} = types[typeName]
    const nameStartLower = name.charAt(0).toLowerCase() + name.slice(1)

    let query = '_id status createdBy{_id username}'
    let queryMutation = '_id status createdBy{_id username}'

    let insertParams = '', insertUpdateQuery = '', updateParams = ''


    if (fields) {
        fields.map(({name, type, required, multi, reference}) => {
            if (insertParams !== '') {
                insertParams += ', '
                updateParams += ', '
                insertUpdateQuery += ', '
            }

            let t = type || 'String'

            if (reference) {
                t = (multi ? '[' : '') + 'ID' + (multi ? ']' : '')

                // todo: field name might be different than name
                query += ' ' + name + '{_id name}'
            } else {
                query += ' ' + name
                queryMutation += ' ' + name
            }

            insertParams += '$' + name + ': ' + t + (required ? '!' : '')
            updateParams += '$' + name + ': ' + t
            insertUpdateQuery += name + ': ' + '$' + name
        })
    }
    result.query = `query ${nameStartLower}s($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}s(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{${query}}}}`

    result.create = `mutation create${name}(${insertParams}){create${name}(${insertUpdateQuery}){${queryMutation}}}`
    result.update = `mutation update${name}($_id: ID!,${updateParams}){update${name}(_id:$_id,${insertUpdateQuery}){${queryMutation}}}`
    result.delete = `mutation delete${name}($_id: ID!){delete${name}(_id: $_id){_id status}}`
    return result
}

const prepareTypes = () => {
    const types = {}
    for (const extensionName in extensions) {
        const extension = extensions[extensionName]
        if (extension.options && extension.options.types) {

            extension.options.types.forEach(type => {

                types[type.name] = Object.assign({}, type)

                // add extension name so we know by which extension the type is used
                if (!types[type.name].usedBy) {
                    types[type.name].usedBy = []
                }
                types[type.name].usedBy.push(extensionName)
            })

        }
    }
    Hook.call('Types', {types})

    return types
}


Hook.on('Types', ({types}) => {
    types.Media = {
        "name": "Media",
        "usedBy": ["core"],
        "fields": [
            {
                "name": "name"
            },
            {
                "name": "src",
                "uitype": "image"
            }
        ]
    }
})