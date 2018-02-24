import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import {
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
    Col
} from 'ui/admin'
import FileDrop from 'client/components/FileDrop'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import Util from 'client/util'
import GenericForm from 'client/components/generic/GenericForm'
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import Hook from 'util/hook'
import {getTypes, getTypeQueries, getFormFields} from 'util/types'
import {Link} from 'react-router-dom'

const DEFAULT_RESULT_LIMIT = 10
const {ADMIN_BASE_URL,UPLOAD_URL} = config


class TypesContainer extends React.Component {

    types = null
    pageParams = null
    createEditForm = null
    typeColumns = {}
    typesToSelect = []

    constructor(props) {
        super(props)
        this.types = getTypes()

        this.pageParams = this.determinPageParams(props)
        const {type, page, limit, sort} = this.pageParams
        this.state = {
            confirmDeletionDialog: true,
            dataToDelete: null,
            createEditDialog: false,
            dataToEdit: null,
            data: null
        }

        // prepare list with types for select box
        Object.keys(this.types).map((k) => {
            const t = this.types[k]
            this.typesToSelect.push({value: k, name: k, hint: t.usedBy && 'used by ' + t.usedBy.join(',')})
        })

    }

    componentDidMount() {
        this.getData(this.pageParams, true)
    }


    componentWillReceiveProps(props) {
        const pageParams = this.determinPageParams(props)

        if (this.pageParams.type !== pageParams.type || this.pageParams.page !== pageParams.page || this.pageParams.limit !== pageParams.limit || this.pageParams.sort !== pageParams.sort || this.pageParams.filter !== pageParams.filter) {
            this.pageParams = pageParams
            this.getData(pageParams, true)
        }
    }


    renderTable() {

        const {data} = this.state

        if (data) {

            // small optimization. only render table if data changed
            if (data === this._lastData) {
                return this._renderedTable
            }

            this._lastData = data

            const {type, page, limit, sort} = this.pageParams

            const fields = this.types[type].fields, columns = this.getTableColumns(type), dataSource = []

            if (data.results) {
                data.results.forEach(item => {
                    const dynamic = {}
                    fields.forEach(field => {
                        let v = item[field.name]
                        if (field.reference) {
                            if (v) {
                                if (v.constructor === Array) {
                                    if (field.type === 'Media') {
                                        dynamic[field.name] = v.reduce((s, i) => {
                                            s.push(<img key={i._id} style={{height: '40px'}}
                                                        src={UPLOAD_URL + '/' + i._id}/>)
                                            return s
                                        }, [])
                                    } else {
                                        dynamic[field.name] = v.reduce((s, i) => s + (s !== '' ? ', ' : '') + i.name, '')
                                    }


                                } else {
                                    if (field.type === 'Media') {
                                        dynamic[field.name] =
                                            <img style={{height: '40px'}}
                                                 src={UPLOAD_URL + '/' + v._id}/>
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
                            dynamic[field.name] =
                                <span onBlur={e => this.handleDataChange.bind(this)(e, item, field.name)}
                                      suppressContentEditableWarning contentEditable>{v}</span>
                        }
                    })
                    dataSource.push({
                        ...dynamic,
                        user: item.createdBy.username,
                        date: Util.formattedDateFromObjectId(item._id),
                        action: [
                            <DeleteIconButton key="deleteBtn" disabled={(item.status == 'deleting' || item.status == 'updating')}
                                              onClick={this.handleDeleteDataClick.bind(this, item)}/>,
                            <EditIconButton key="editBtn" disabled={(item.status == 'deleting' || item.status == 'updating')}
                                            onClick={this.handleEditDataClick.bind(this, item)}/>
                        ]
                    })


                })

            }
            const asort = sort.split(' ')

            /* HOOK */
            Hook.call('TypeTable', {type, dataSource, data, fields})

            this._renderedTable = <SimpleTable title={type} dataSource={dataSource} columns={columns} count={data.total}
                                               rowsPerPage={limit} page={page}
                                               orderBy={asort[0]}
                                               actions={[{
                                                   name: 'Add new ' + type, onClick: () => {
                                                       this.setState({createEditDialog: true})
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
        const {dataToEdit} = this.state
        const {fixType} = this.props
        const {type, filter} = this.pageParams
        const formFields = getFormFields(type)

        if (!this.types[type]) return <BaseLayout><Typography variant="subheading" color="error">Type {type} does not
            exist.
            Types can be specified in an extension.</Typography></BaseLayout>


        const editDialogProps = {
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


        const content = <BaseLayout>
            <Typography variant="display2" gutterBottom>{fixType?fixType:'Types'}</Typography>

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
                <Col md={(fixType?12:3)} align="right">
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

            {this.renderTable()}

            <Typography variant="display1" component="h2" gutterBottom>Available fields</Typography>

            {type &&
            this.types[type].fields.map(field => {
                return <Chip key={field.name} label={field.name + (field.reference ? ' -> ' + field.type : '')}/>
            })
            }

            {this.state.dataToDelete &&
            <SimpleDialog open={this.state.confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                          title="Confirm deletion">
                Are you sure you want to delete this item?
            </SimpleDialog>
            }

            <SimpleDialog {...editDialogProps}/>
        </BaseLayout>

        console.info(`render ${this.constructor.name} in ${new Date() - startTime}ms`)

        return content
    }


    getTableColumns(type) {
        if (this.typeColumns[type]) return this.typeColumns[type]

        this.typeColumns[type] = []
        this.types[type].fields.forEach(field => {
            this.typeColumns[type].push({title: field.name, id: field.name, sortable: true})
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
        const result = {limit: lInt || DEFAULT_RESULT_LIMIT, page: pInt || 1, sort: s || '', filter: f || ''}
        if( props.fixType ){
            result.type = props.fixType
        }else if (params.type) {
            result.type = params.type
        } else {
            for (const prop in this.types) {
                result.type = prop
                break
            }
        }

        return result
    }

    getStoreKey(type) {
        return type.charAt(0).toLowerCase() + type.slice(1) + 's'
    }

    getData({type, page, limit, sort, filter}, cacheFirst) {
        const {client} = this.props
        if (type) {
            const queries = getTypeQueries(type)

            if (queries) {

                const storeKey = this.getStoreKey(type),
                    variables = {limit, page, sort, filter},
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
                            refResults[idx] = Object.assign({}, refResults[idx], changedData, optimisticData)
                            //console.log(refResults[idx],changedData)
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


    runFilter(f) {
        const {type, limit, sort} = this.pageParams
        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${sort}&f=${encodeURIComponent(f)}`)
    }

    handleFilterTimeout = null
    handleFilter = ({value}, immediate) => {
        clearTimeout(this.handleFilterTimeout)

        if (immediate) {
            this.runFilter(value)
        } else {
            this.handleFilterTimeout = setTimeout(()=> {this.runFilter(value)}, 1000)
        }

    }

    handelFilterKeyDown = (e, value) => {
        if (e.key === "Enter") {
            e.preventDefault()
            this.handleFilter({value},true)
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

        this.props.history.push(`${ADMIN_BASE_URL}/types/${type}/?p=1&l=${limit}&s=${newSort}&f=${filter}`)
    }


    handleTypeChange = event => {
        if (event.target.value !== this.pageParams.type) {
            console.log(this.props.history)
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


    referencesToIds = (input) => {

        const formFields = getFormFields(this.pageParams.type)
        // make sure if it is a reference only id gets passed as imput to craeteData
        const ipt2 = {}
        Object.keys(input).map(k => {
            const item = input[k]
            const {multi} = formFields[k]
            if (item !== undefined) {
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
}

TypesContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    fixType: PropTypes.string
}


const mapStateToProps = (store) => ({user: store.user})


export default connect(
    mapStateToProps
)(withRouter(withApollo(TypesContainer)))


/* Type Media */

Hook.on('Types', ({types}) => {
    types.Media = {
        "name": "Media",
        "usedBy": ["core"],
        "fields": [
            {
                "name": "name"
            }
        ]
    }

    types.CmsPage = {
        "name": "CmsPage",
        "usedBy": ["core"],
        "fields": [
            {
                "name": "slug",
                "required": true
            },
            {
                "name": "public",
                "type":"Boolean"
            }
        ]
    }
})

// add an extra column for Media at the beginning
Hook.on('TypeTableColumns', ({type, columns}) => {
    if (type === 'Media') {
        columns.unshift({title: "Data", id: "data"})
    }
})

// add some extra data to the table
Hook.on('TypeTable', ({type, dataSource, data}) => {
    if (type === 'Media') {
        dataSource.forEach((d, i) => {
            d.data = <img height="40" src={UPLOAD_URL + '/' + data.results[i]._id}/>
        })
    }else if (type === 'CmsPage') {
        dataSource.forEach((d,i) => {
            d.action.push(<Link key="viewBtn"
                to={'/' + data.results[i].slug}> View</Link>)
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

