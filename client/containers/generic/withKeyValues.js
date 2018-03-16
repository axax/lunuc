import React from 'react'
import PropTypes from 'prop-types'
import gql from 'graphql-tag'
import {graphql, compose} from 'react-apollo'
import {connect} from 'react-redux'

const LOCAL_STORAGE_KEY = 'noUserKeyValues'
/*
 this is a warpper component for accessing user key values
 */

let keyValuesFromLS = null

// This function takes a component...
export function withKeyValues(WrappedComponent, keys) {

    const getKeyValuesFromLS = () => {
        if (!keyValuesFromLS) {
            keyValuesFromLS = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY))
            if (!keyValuesFromLS) keyValuesFromLS = {}
        }
        return keyValuesFromLS
    }

    const setKeyValueToLS = (key, value) => {
        const kv = getKeyValuesFromLS()
        kv[key] = value
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(kv))
    }

    // ...and returns another component...
    class WithKeyValues extends React.Component {
        constructor(props) {
            super(props)
        }

        render() {
            const {keyValues, user, ...rest} = this.props

            let keyValueMap

            if (!user.isAuthenticated) {
                // fallback: load keyValues from localstore
                keyValueMap = getKeyValuesFromLS()
            } else if (keyValues) {
                keyValueMap = {}
                // create a keyvalue map
                const {results} = keyValues
                if (results) {
                    for (const i in results) {
                        const o = results[i]
                        keyValueMap[o.key] = o.value
                    }
                }
            }
            // ... and renders the wrapped component with the fresh data!
            // Notice that we pass through any additional props
            return <WrappedComponent keyValues={keyValues} keyValueMap={keyValueMap} {...rest} />;
        }
    }

    WithKeyValues.propTypes = {
        keyValues: PropTypes.object,
        user: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        setKeyValue: PropTypes.func.isRequired,
        deleteKeyValue: PropTypes.func.isRequired,
    }

    const gqlKeyValueQuery = gql`query{ 
        keyValues${keys ? '(keys:' + JSON.stringify(keys) + ')' : ''}{limit offset total results{key value status createdBy{_id username}} }
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
            skip: props => !props.user.isAuthenticated, // skip request if user is not logged in
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
                    if (!ownProps.user.isAuthenticated) {
                        return new Promise((res) => {
                            setKeyValueToLS(key, value)
                            res()
                        })
                    }
                    const valueStr = value.constructor===String?value:JSON.stringify(value)

                    return mutate({
                        variables: {key, value:valueStr},
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
                                value:valueStr,
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
                    if (!ownProps.user.isAuthenticated) {
                        return new Promise((res) => {
                            setKeyValueToLS(key, null)
                            res()
                        })
                    }
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
    const mapStateToProps = (store) => ({user: store.user})


    /**
     * Connect the component to
     * the Redux store.
     */
    return connect(
        mapStateToProps
    )(WithKeyValuesWithGql)
}
