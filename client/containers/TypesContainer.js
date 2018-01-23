import React from 'react'
import PropTypes from 'prop-types'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {DeleteIconButton, Chip, Typography, MenuItem, Select, TextField, Input, SimpleDialog, SimpleTable} from 'ui/admin'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import Util from 'client/util'
import GenericForm from 'client/components/generic/GenericForm'
import {withRouter} from 'react-router-dom'
import {ADMIN_BASE_URL} from 'gen/config'



class TypesContainer extends React.Component {

    types = null
    queries = {}

    constructor(props) {
        super(props)
        this.types = prepareTypes()

        const selectedType = this.determinSelectedType(props)
        this.state = {
            selectedType,
            loading: false,
            data:this.getData(props,selectedType),
            rowsPerPage: 10,
            confirmDeletionDialog: true,
            dataToBeDeleted: null
        }
    }


    componentWillReceiveProps(props) {
        const {params: {type,page}} = props.match
        console.log(type,page)
        if( type && type !== this.state.selectedType){
            this.setState({selectedType:type})
            this.getData(props,type)
        }
    }


    render() {
        console.log('render types')
        const {selectedType, loading, data} = this.state

        let tableWithResults
        if (data) {

            const columns = []

            this.types[selectedType].fields.forEach(field => {
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

                    this.types[selectedType].fields.forEach(field => {
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

            const currentPage = Math.ceil(data.offset / 10) + 1


            tableWithResults = <SimpleTable dataSource={dataSource} columns={columns} count={data.total}
                                            rowsPerPage={this.state.rowsPerPage} page={currentPage}
                                            onChangePage={this.handleChangePage.bind(this)}
                                            onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}/>
        }

        const formFields = {}
        this.types[selectedType].fields.map(field => {
            if (!field.type || field.type.indexOf('[') < 0) {
                formFields[field.name] = {placeholder: `Enter ${field.name}`}
            }
        })


        return <BaseLayout>
            <Typography type="display4" gutterBottom>Types</Typography>
            <Select
                value={selectedType}
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


            {selectedType &&
            this.types[selectedType].fields.map(field => {
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
    }


    determinSelectedType(props){
        const {params} = props.match
        if( params.type ) return params.type

        for (const prop in this.types) {
            return prop
        }
    }

    getQueries(selectedType) {
        if (!this.queries[selectedType])
            this.queries[selectedType] = buildQueries(selectedType, this.types)
        return this.queries[selectedType]
    }

    getData(props, selectedType) {
        const {client} = props

        if (selectedType) {
            const queries = this.getQueries(selectedType)
            const selectedTypeStartLower = selectedType.charAt(0).toLowerCase() + selectedType.slice(1)

            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gql(queries.query),
                variables: {}
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

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {}
                    })
                    if (storeData[selectedTypeStartLower]) {
                        if( !storeData[selectedTypeStartLower].results ){
                            storeData[selectedTypeStartLower].results=[]
                        }

                        if (data['create' + selectedType]) {
                            storeData[selectedTypeStartLower].results.unshift(data['create' +selectedType])
                            storeData[selectedTypeStartLower].total += 1
                        }
                        store.writeQuery({
                            query: gqlQuery,
                            variables: {},
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
                    _id:input._id,
                    [key]:input[key]
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {}
                    })


                    if (storeData[selectedTypeStartLower]) {
                        const refResults = storeData[selectedTypeStartLower].results

                        const idx = refResults.findIndex(x => x._id === data['update' + selectedType]._id)
                        if (idx > -1) {
                            refResults[idx] =  Object.assign({},refResults[idx], Util.removeNullValues(input))
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {},
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
                    _id:id
                },
                update: (store, {data}) => {
                    const gqlQuery = gql(queries.query)

                    // Read the data from the cache for this query.
                    const storeData = store.readQuery({
                        query: gqlQuery,
                        variables: {}
                    })

                    if (storeData[selectedTypeStartLower]) {

                        const idx = storeData[selectedTypeStartLower].results.findIndex(x => x._id === data['delete' + selectedType]._id)
                        if (idx > -1) {
                            if (data['delete' + selectedType].status === 'deleting') {
                                storeData[selectedTypeStartLower].results[idx].status = 'deleting'
                            } else {
                                storeData[selectedTypeStartLower].results.splice(idx, 1)
                            }
                            storeData[selectedTypeStartLower].total -= 1
                            store.writeQuery({
                                query: gqlQuery,
                                variables: {},
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
        this.props.history.push(`${ADMIN_BASE_URL}/types/${this.state.selectedType}/${page}`)
    }


    handleChangeRowsPerPage = (rowsPerPage) => {
        this.setState({rowsPerPage})
    }


    handleAddDataClick = (input) => {
        this.createData(this.state.selectedType, input)
    }

    handleDataChange = (event, data, key) => {
        const t = event.target.innerText.trim()
        if (t != data[key]) {
            this.updateData(this.state.selectedType,{...data,[key]:t},key)
        }
    }

    handleDeleteDataClick = (data) => {
        this.setState({confirmDeletionDialog: true, dataToBeDeleted: data})
    }

    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            this.deleteData(this.state.selectedType,this.state.dataToBeDeleted._id)
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
