import React from 'react'
import PropTypes from 'prop-types'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {
    DeleteIconButton,
    Chip,
    Typography,
    MenuItem,
    Select,
    TextField,
    Input,
    SimpleDialog,
    SimpleTable,
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

const DEFAULT_RESULT_LIMIT = 10

class TypesContainer extends React.Component {

    types = null
    queries = {}
    pageParams = null

    constructor(props) {
        super(props)
        this.types = prepareTypes()

        this.pageParams = this.determinPageParams(props)
        const {type, page, limit, sort} = this.pageParams
        this.state = {
            loading: false,
            confirmDeletionDialog: true,
            dataToBeDeleted: null
        }

        this.state.data = this.getData(this.pageParams)

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
        const {loading, data} = this.state
        const {type, page, limit, sort, filter} = this.pageParams

        let tableWithResults
        if (data) {

            const columns = []

            this.types[type].fields.forEach(field => {
                if (!field.type || field.type.indexOf('[') < 0) {
                    columns.push({title: field.name, dataIndex: field.name, sortable: true})
                }
            })
            columns.push({
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

            const dataSource = []

            if (data.results) {
                data.results.forEach(item => {
                    const dynamic = {}

                    this.types[type].fields.forEach(field => {
                        if (!field.type || field.type.indexOf('[') < 0) {

                            dynamic[field.name] =
                                <span onBlur={(e) => this.handleDataChange.bind(this)(e, item, field.name)}
                                      suppressContentEditableWarning contentEditable>{item[field.name]}</span>

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
            tableWithResults = <SimpleTable dataSource={dataSource} columns={columns} count={data.total}
                                            rowsPerPage={parseInt(limit)} page={page}
                                            orderBy={asort[0]}
                                            orderDirection={asort.length > 1 && asort[1] || null}
                                            onSort={this.handleSortChange}
                                            onChangePage={this.handleChangePage.bind(this)}
                                            onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>
        }

        const formFields = {}
        this.types[type].fields.map(field => {
            if (!field.type || field.type.indexOf('[') < 0) {
                formFields[field.name] = {placeholder: `Enter ${field.name}`}
            }
        })


        const content = <BaseLayout>
            <Typography type="display4" gutterBottom>Types</Typography>
            <Select
                value={type}
                onChange={this.handleTypeChange}
                input={<Input name="type"/>}
            >
                {
                    Object.keys(this.types).map((k) => {
                        const type = this.types[k]
                        return <MenuItem key={k} value={k}>{k}&nbsp;<em>(used
                            in {type.usedBy.join(',')})</em></MenuItem>
                    })
                }
            </Select>
            {loading && 'loading'}

            <Row spacing={16}>
                <Col md={9}>
                    <GenericForm caption="Add" fields={formFields}
                                 onClick={this.handleAddDataClick}/>
                </Col>
                <Col md={3}>
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
        </BaseLayout>

        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content
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

    getData({type, page, limit, sort, filter}) {
        const {client} = this.props

        if (type) {
            const queries = this.getQueries(type)
            const typeStartLower = type.charAt(0).toLowerCase() + type.slice(1)

            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gql(queries.query),
                variables: {limit, page, sort, filter}
            }).then(response => {
                this.setState({loading: false, data: response.data[typeStartLower]})
            }).catch(error => {
                console.log(error.message)

                this.setState({loading: false, data: null})
            })
        }
    }

    createData({type, page, limit, sort, filter}, input) {
        const {client} = this.props


        if (type) {

            const queries = this.getQueries(type)
            const typeStartLower = type.charAt(0).toLowerCase() + type.slice(1)

            client.mutate({
                mutation: gql(queries.create),
                variables: {
                    ...input
                },
                update: (store, {data}) => {
                    console.log('create', data['create' + type])
                    const gqlQuery = gql(queries.query)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
                    })
                    if (storeData[typeStartLower]) {
                        if (!storeData[typeStartLower].results) {
                            storeData[typeStartLower].results = []
                        }

                        if (data['create' + type]) {
                            storeData[typeStartLower].results.unshift(data['create' + type])
                            storeData[typeStartLower].total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables: {page, limit, sort, filter},
                            data: storeData
                        })
                        this.setState({loading: false, data: storeData[typeStartLower]})
                    }

                },
            })
        }
    }

    updateData({type, page, limit, sort, filter}, input, key) {
        const {client} = this.props

        if (type) {

            const queries = this.getQueries(type)
            const typeStartLower = type.charAt(0).toLowerCase() + type.slice(1)

            client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: {
                    _id: input._id,
                    [key]: input[key]
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {page, limit, sort, filter}
                    })


                    if (storeData[typeStartLower]) {
                        const refResults = storeData[typeStartLower].results

                        const idx = refResults.findIndex(x => x._id === data['update' + type]._id)
                        if (idx > -1) {
                            refResults[idx] = Object.assign({}, refResults[idx], Util.removeNullValues(input))
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {page, limit, sort, filter},
                                data: storeData
                            })
                        }
                    }

                },
            })
        }
    }


    deleteData({type, page, limit, sort, filter}, id) {
        const {client} = this.props

        if (type) {

            const queries = this.getQueries(type)
            const typeStartLower = type.charAt(0).toLowerCase() + type.slice(1)

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

                    if (storeData[typeStartLower]) {
                        const refResults = storeData[typeStartLower].results

                        const idx = refResults.findIndex(x => x._id === data['delete' + type]._id)
                        if (idx > -1) {
                            if (data['delete' + type].status === 'deleting') {
                                refResults[idx].status = 'deleting'
                            } else {
                                refResults.splice(idx, 1)
                                storeData[typeStartLower].total -= 1
                            }
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {page, limit, sort, filter},
                                data: storeData
                            })
                            this.setState({loading: false, data: storeData[typeStartLower]})
                        }
                    }

                },
            })
        }
    }


    handleFilterTimeout = null
    handleFilter = ({value}) => {
        clearTimeout(this.handleFilterTimeout)
        this.handleFilterTimeout = setTimeout(()=>{
            const {type, limit, sort} = this.pageParams
            this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${sort}&f=${value}`)
        },1000)
    }

    handleSortChange = (e, orderBy) => {
        const {type, limit, sort, filter} = this.pageParams

        const aSort = sort.split(' ')
        let orderDirection = 'desc';
        if (aSort.length > 1 && orderBy === aSort[0] && orderDirection === aSort[1]) {
            orderDirection = 'asc';
        }
        const newSort = `${orderBy} ${orderDirection}`

        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${newSort}&f=${filter}`)
    }


    handleTypeChange = event => {
        this.props.history.push(`${ADMIN_BASE_URL}/types/${event.target.value}`)
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
        this.createData(this.pageParams, input)
    }

    handleDataChange = (event, data, key) => {
        const t = event.target.innerText.trim()
        if (t != data[key]) {
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

    let insertParams = '', insertQuery = ''

    if (fields) {
        fields.map(e => {
            if (!e.type || e.type.indexOf('[') < 0) {
                if (insertParams !== '') {
                    insertParams += ', '
                    insertQuery += ', '
                }
                insertParams += '$' + e.name + ': ' + (e.type || 'String')
                insertQuery += e.name + ': ' + '$' + e.name
                query += ' ' + e.name
            }
        })
    }
    result.query = `query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit page total results{${query}}}}`

    result.create = `mutation create${name}(${insertParams}){create${name}(${insertQuery}){${query}}}`
    result.update = `mutation update${name}($_id: ID!,${insertParams}){update${name}(_id:$_id,${insertQuery}){${query}}}`
    result.delete = `mutation delete${name}($_id: ID!){delete${name}(_id: $_id){_id status}}`

    return result
}

const prepareTypes = () => {
    const results = {}
    for (const extensionName in extensions) {
        const extension = extensions[extensionName]
        if (extension.options && extension.options.types) {

            extension.options.types.forEach(type => {

                results[type.name] = Object.assign({}, type)

                // add extension name so we know by which extension the type is used
                if (!results[type.name].usedBy) {
                    results[type.name].usedBy = []
                }
                results[type.name].usedBy.push(extensionName)
            })

        }
    }
    return results
}
