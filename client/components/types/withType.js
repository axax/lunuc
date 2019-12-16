import React from 'react'
import {connect} from 'react-redux'
import {withApollo} from 'react-apollo'
import gql from 'graphql-tag'
import {getTypeQueries} from 'util/types'
import {deepMerge} from "../../../util/deepMerge";


// enhance cmsview with editor functionalities if in edit mode
export default function(WrappedComponent) {


    class Wrapper extends React.Component {
        constructor(props) {
            super(props)
        }

        render() {
            return <WrappedComponent createData={this.createData.bind(this)}
                                     updateData={this.updateData.bind(this)}
                                     {...this.props}/>
        }



        createData({type, page, limit, sort, filter, _version}, input, optimisticInput) {
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


        updateData({type, page, limit, sort, filter, _version}, changedData, optimisticData) {
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
    }

    /**
     * Map the state to props.
     */
    const mapStateToProps = (store) => {
        return {
            user: store.user
        }
    }

    /**
     * Connect the component to
     * the Redux store.
     */
    return connect(
        mapStateToProps
    )(withApollo(Wrapper))

}
