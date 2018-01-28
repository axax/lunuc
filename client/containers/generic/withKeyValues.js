import React from 'react'
import PropTypes from 'prop-types'
import gql from 'graphql-tag'
import {graphql, compose} from 'react-apollo'
import {connect} from 'react-redux'

// This function takes a component...
export function withKeyValues(WrappedComponent, keys) {
    // ...and returns another component...
    class WithKeyValues extends React.Component {
        constructor(props) {
            super(props)
        }

        render() {
            const {keyValues} = this.props
            if( !keyValues )
                return null

            const {results} = keyValues
            const keyValueMap = {}
            if (results) {
                for (const i in results) {
                    const o = results[i]
                    keyValueMap[o.key] = o.value
                }
            }

            // ... and renders the wrapped component with the fresh data!
            // Notice that we pass through any additional props
            return <WrappedComponent keyValueMap={keyValueMap} {...this.props} />;
        }
    }

    WithKeyValues.propTypes = {
        keyValues: PropTypes.object,
        user: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        setKeyValue: PropTypes.func.isRequired,
        deleteKeyValue: PropTypes.func.isRequired
    }

    const gqlKeyValueQuery = gql`query{ 
        keyValues${keys?'(keys:'+JSON.stringify(keys)+')':''}{limit offset total results{key value status createdBy{_id username}} }
    }`

    const gqlKeyValueUpdate = gql`
      mutation setKeyValue($key: String!, $value: String!) {
        setKeyValue(key: $key, value: $value){
            key value status createdBy{_id username}
        }
      }`

    const gqlKeyValueDelete = gql`
      mutation deleteKeyValue($key: String!) {
        deleteKeyValue(key: $key){
            key status
        }
      }`

    const WithKeyValuesWithGql = compose(
        graphql(gqlKeyValueQuery, {
            options() {
                return {
                    fetchPolicy: 'cache-and-network',
                }
            },
            props: ({data: {loading, keyValues}}) => ({
                keyValues,
                loading
            })
        }),
        graphql(gqlKeyValueUpdate, {
            props: ({ownProps, mutate}) => ({
                setKeyValue: ({key, value}) => {
                    console.log(key,value)
                    return mutate({
                        variables: {key, value},
                        optimisticResponse: {
                            __typename: 'Mutation',
                            setKeyValue: {
                                status: 'creating',
                                createdBy: {
                                    _id: ownProps.user.userData._id,
                                    username: ownProps.user.userData.username,
                                    __typename: 'UserPublic'
                                },
                                key,
                                value,
                                __typename: 'KeyValue'
                            }
                        },
                        update: (proxy, {data: {setKeyValue}}) => {
                            // Read the data from our cache for this query.
                            const data = proxy.readQuery({query: gqlKeyValueQuery})

                            if (!data.keyValues.results) {
                                data.keyValues.results = []
                            }
                            const idx = data.keyValues.results.findIndex(x => x.key === setKeyValue.key)
                            if (idx > -1) {
                                data.keyValues.results[idx].value = setKeyValue.value
                            } else {
                                data.keyValues.results.push(setKeyValue)
                                data.keyValues.total++;
                            }
                            // Write our data back to the cache.
                            proxy.writeQuery({query: gqlKeyValueQuery, data})
                        }
                    })
                }
            })
        }),
        graphql(gqlKeyValueDelete, {
            props: ({ownProps, mutate}) => ({
                deleteKeyValue: ({key}) => {
                    return mutate({
                        variables: {key},
                        optimisticResponse: {
                            __typename: 'Mutation',
                            deleteKeyValue: {
                                status: 'deleting',
                                key,
                                __typename: 'KeyValue'
                            }
                        },
                        update: (proxy, {data: {deleteKeyValue}}) => {
                            // Read the data from our cache for this query.
                            const data = proxy.readQuery({query: gqlKeyValueQuery})
                            // Add our note from the mutation to the end.
                            const idx = data.keyValues.results.findIndex(x => x.key === deleteKeyValue.key)
                            if (idx >= 0) {
                                if (deleteKeyValue.status == 'deleting') {
                                    data.keyValues.results[idx].status = 'deleting'
                                } else {
                                    data.keyValues.results.splice(idx, 1)
                                }
                                proxy.writeQuery({query: gqlKeyValueQuery, data})
                            }
                        }
                    })
                }
            })
        })
    )(WithKeyValues)



    /**
     * Map the state to props.
     */
    const mapStateToProps = (store) => ({user:store.user})


    /**
     * Connect the component to
     * the Redux store.
     */
    return connect(
        mapStateToProps
    )(WithKeyValuesWithGql)
}
