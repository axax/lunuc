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
    SimpleTable
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

    constructor(props) {
        super(props)
        this.types = prepareTypes()

        const {type,page,limit} = this.determinPageParams(props)
        this.state = {
            loading: false,
            confirmDeletionDialog: true,
            dataToBeDeleted: null
        }

        this.state.data = this.getData(type, page, limit)

    }


    componentWillReceiveProps(props) {
        const {type,page,limit} = this.determinPageParams(props)
        const matchBefore = this.props.match
        if (type !== matchBefore.type || page !== matchBefore.page || limit !== matchBefore.limit) {
            this.getData(type, page, limit)
        }
    }


    render() {
        const startTime = new Date()
        const {loading, data} = this.state
        const {type,page,limit} = this.determinPageParams(this.props)

        let tableWithResults
        if (data) {

            const columns = []

            this.types[type].fields.forEach(field => {
                if (!field.type || field.type.indexOf('[') < 0) {
                    columns.push({title: field.name, dataIndex: field.name})
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
            tableWithResults = <SimpleTable dataSource={dataSource} columns={columns} count={data.total}
                                            rowsPerPage={parseInt(limit)} page={page}
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
                input={<Input name="selectedType"/>}
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

            <GenericForm fields={formFields}
                         onClick={this.handleAddDataClick}/>

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

        const result = {limit: params.limit || DEFAULT_RESULT_LIMIT, page: params.page || 1}
        if (params.type){
            result.type = params.type
        }else{
            for (const prop in this.types) {
                result.type = prop
                break
            }
        }

        return result
    }

    getQueries(selectedType) {
        if (!this.queries[selectedType])
            this.queries[selectedType] = buildQueries(selectedType, this.types)
        return this.queries[selectedType]
    }

    getData(selectedType, page, limit) {
        const {client} = this.props
        console.log(limit, selectedType)
        console.log(page, selectedType)


        if (selectedType) {
            const queries = this.getQueries(selectedType)
            const selectedTypeStartLower = selectedType.charAt(0).toLowerCase() + selectedType.slice(1)

            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gql(queries.query),
                variables: {limit, offset: (page-1) * limit}
            }).then(response => {
                this.setState({loading: false, data: response.data[selectedTypeStartLower]})
            }).catch(error => {
                console.log(error.message)

                this.setState({loading: false, data: null})
            })
        }
    }

    createData(selectedType, input) {
        const {client} = this.props

        if (selectedType) {

            const queries = this.getQueries(selectedType)
            const selectedTypeStartLower = selectedType.charAt(0).toLowerCase() + selectedType.slice(1)

            client.mutate({
                mutation: gql(queries.create),
                variables: {
                    ...input
                },
                update: (store, {data}) => {
                    console.log('create', data['create' + selectedType])
                    const gqlQuery = gql(queries.query)

                    const {page,limit} = this.determinPageParams(this.props)
                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {limit, offset: (page-1) * limit}
                    })
                    if (storeData[selectedTypeStartLower]) {
                        if (!storeData[selectedTypeStartLower].results) {
                            storeData[selectedTypeStartLower].results = []
                        }

                        if (data['create' + selectedType]) {
                            storeData[selectedTypeStartLower].results.unshift(data['create' + selectedType])
                            storeData[selectedTypeStartLower].total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables: {limit, offset: (page-1) * limit},
                            data: storeData
                        })
                        this.setState({loading: false, data: storeData[selectedTypeStartLower]})
                    }

                },
            })
        }
    }

    updateData(selectedType, input, key) {
        const {client} = this.props

        if (selectedType) {

            const queries = this.getQueries(selectedType)
            const selectedTypeStartLower = selectedType.charAt(0).toLowerCase() + selectedType.slice(1)

            client.mutate({
                mutation: gql(queries.update),
                /* only send what has changed*/
                variables: {
                    _id: input._id,
                    [key]: input[key]
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)
                    const {page,limit} = this.determinPageParams(this.props)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {limit, offset: (page-1) * limit}
                    })


                    if (storeData[selectedTypeStartLower]) {
                        const refResults = storeData[selectedTypeStartLower].results

                        const idx = refResults.findIndex(x => x._id === data['update' + selectedType]._id)
                        if (idx > -1) {
                            refResults[idx] = Object.assign({}, refResults[idx], Util.removeNullValues(input))
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {limit, offset: (page-1) * limit},
                                data: storeData
                            })
                        }
                    }

                },
            })
        }
    }


    deleteData(selectedType, id) {
        const {client} = this.props

        if (selectedType) {

            const queries = this.getQueries(selectedType)
            const selectedTypeStartLower = selectedType.charAt(0).toLowerCase() + selectedType.slice(1)

            client.mutate({
                mutation: gql(queries.delete),
                variables: {
                    _id: id
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)
                    const {page,limit} = this.determinPageParams(this.props)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {limit, offset: (page-1) * limit}
                    })

                    if (storeData[selectedTypeStartLower]) {
                        const refResults = storeData[selectedTypeStartLower].results

                        const idx = refResults.findIndex(x => x._id === data['delete' + selectedType]._id)
                        if (idx > -1) {
                            if (data['delete' + selectedType].status === 'deleting') {
                                refResults[idx].status = 'deleting'
                            } else {
                                refResults.splice(idx, 1)
                                storeData[selectedTypeStartLower].total -= 1
                            }
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {limit, offset: (page-1) * limit},
                                data: storeData
                            })
                            this.setState({loading: false, data: storeData[selectedTypeStartLower]})
                        }
                    }

                },
            })
        }
    }


    handleTypeChange = event => {
        this.props.history.push(`${ADMIN_BASE_URL}/types/${event.target.value}`)
        /*this.setState({[event.target.name]: event.target.value})
         this.getData(event.target.value)*/
    }

    handleChangePage = (page) => {
        const {type,limit} = this.determinPageParams(this.props)
        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/${page}/${limit}`)
    }


    handleChangeRowsPerPage = (limit) => {
        const {type} = this.determinPageParams(this.props)
        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/1/${limit}`)
    }


    handleAddDataClick = (input) => {
        const {type} = this.determinPageParams(this.props)
        this.createData(type, input)
    }

    handleDataChange = (event, data, key) => {
        const t = event.target.innerText.trim()
        if (t != data[key]) {
            const {type} = this.determinPageParams(this.props)
            this.updateData(type, {...data, [key]: t}, key)
        }
    }

    handleDeleteDataClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToBeDeleted: data})
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            const {type} = this.determinPageParams(this.props)
            this.deleteData(type, this.state.dataToBeDeleted._id)
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
    if (!typeName) return null

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
    result.query = `query ${nameStartLower}($sort: String,$limit: Int,$offset: Int,$filter: String){
                ${nameStartLower}(sort:$sort, limit: $limit, offset:$offset, filter:$filter){limit offset total results{${query}}}}`

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
