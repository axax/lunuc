import React from 'react'
import PropTypes from 'prop-types'
import gql from 'graphql-tag'
import {graphql, compose} from 'react-apollo'
import {connect} from 'react-redux'

export const NO_SESSION_KEY_VALUES = 'NO_SESSION_KEY_VALUES'
export const NO_SESSION_KEY_VALUES_SERVER = 'NO_SESSION_KEY_VALUES_SERVER'

/*
 this is a warpper component for accessing user key values
 */

const keyValuesFromLS = {}


export const getKeyValueFromLS = (key) => {
    const kv = getKeyValuesFromLS()
    try {
        return JSON.parse(kv[key])
    } catch (e) {
        return kv[key]
    }
}

export const getKeyValuesFromLS = () => {
    const kvServer = getKeyValuesFromLSByKey(NO_SESSION_KEY_VALUES_SERVER),
        kvClient = getKeyValuesFromLSByKey(NO_SESSION_KEY_VALUES)
    return Object.assign({}, kvClient, kvServer)
}

export const getKeyValuesFromLSByKey = (localStorageKey) => {

    if (!keyValuesFromLS[localStorageKey]) {
        try {
            keyValuesFromLS[localStorageKey] = JSON.parse(localStorage.getItem(localStorageKey))
        } finally {
        }
        if (!keyValuesFromLS[localStorageKey]) keyValuesFromLS[localStorageKey] = {}
    }
    return keyValuesFromLS[localStorageKey]
}

export const setKeyValueToLS = (key, value, server) => {
    const localStorageKey = server ? NO_SESSION_KEY_VALUES_SERVER : NO_SESSION_KEY_VALUES

    const kv = getKeyValuesFromLSByKey(localStorageKey)
    kv[key] = value

    localStorage.setItem(localStorageKey, JSON.stringify(kv))
}

// This function takes a component...
export function withKeyValues(WrappedComponent, keys, keysGlobal) {

    // ...and returns another component...
    class WithKeyValues extends React.Component {


        keyValuesLast = false
        keyValueGlobalsLast = false
        keyValueMap = {}
        keyValueGlobalMap = {}

        constructor(props) {
            super(props)
        }

        shouldComponentUpdate(nextProps, nextState) {

            const ignoreToCompare = ['deleteKeyValueByKey', 'setKeyValue', 'setKeyValueGlobal', 'loading']
            for (const k of Object.keys(nextProps)) {

                if (!ignoreToCompare.includes(k) && nextProps[k] !== this.props[k]) {
                    return true
                }
            }
            return false
        }


        render() {
            const {keyValues, keyValueGlobals, kvUser, loading, ...rest} = this.props


            if (keys) {
                if (!kvUser.isAuthenticated) {
                    // fallback: load keyValues from localstore
                    this.keyValueMap = getKeyValuesFromLS()
                } else if (keyValues) {
                    if (keyValues !== this.keyValuesLast) {
                        this.keyValuesLast = keyValues
                        this.keyValueMap = {}
                        // create a keyvalue map
                        const {results} = keyValues
                        if (results) {
                            for (const i in results) {
                                const o = results[i]
                                try {
                                    this.keyValueMap[o.key] = JSON.parse(o.value)
                                } catch (e) {
                                    this.keyValueMap[o.key] = o.value
                                }
                            }
                        }
                    }
                } else if (loading) {
                    // there is nothing in cache
                    if (!keyValueGlobals) {
                        return null
                    }

                }
            }

            if (keyValueGlobals && keyValueGlobals !== this.keyValueGlobalsLast) {
                const {results} = keyValueGlobals
                this.keyValueGlobalsLast = keyValueGlobals
                this.keyValueGlobalMap = {}
                if (results) {
                    for (const i in results) {
                        const o = results[i]
                        try {
                            this.keyValueGlobalMap[o.key] = JSON.parse(o.value)
                        } catch (e) {
                            this.keyValueGlobalMap[o.key] = o.value
                        }
                    }
                }
            }

            // ... and renders the wrapped component with the fresh data!
            // Notice that we pass through any additional props
            return <WrappedComponent keyValues={keyValues} keyValueMap={this.keyValueMap}
                                     keyValueGlobalMap={this.keyValueGlobalMap} {...rest} />
        }
    }

    WithKeyValues.propTypes = {
        keyValues: PropTypes.object,
        keyValueGlobals: PropTypes.object,
        kvUser: PropTypes.object.isRequired,
        loading: PropTypes.bool,
        setKeyValue: PropTypes.func.isRequired,
        setKeyValueGlobal: PropTypes.func.isRequired,
        deleteKeyValueByKey: PropTypes.func.isRequired,
    }


    const gqlKeyValueQuery = gql`query{keyValues${keys ? '(keys:' + JSON.stringify(keys) + ')' : ''}{limit offset total results{key value status createdBy{_id username}}}}`,
        gqlKeyValueGlobalsQuery = gql`query{ 
        keyValueGlobals${keysGlobal ? '(keys:' + JSON.stringify(keysGlobal) + ')' : ''}{limit offset total results{key value status} }
        }`,
        gqlKeyValueUpdate = gql`
          mutation setKeyValue($key: String!, $value: String!) {
            setKeyValue(key: $key, value: $value){
                key value status createdBy{_id username}
            }
          }`,
        gqlKeyValueGlobalUpdate = gql`
          mutation setKeyValueGlobal($key: String!, $value: String!) {
            setKeyValueGlobal(key: $key, value: $value){
                key value status
            }
          }`,
        gqlKeyValueDelete = gql`
          mutation deleteKeyValueByKey($key: String!) {
            deleteKeyValueByKey(key: $key){
                key status
            }
          }`

    const WithKeyValuesWithGql = compose(
        graphql(gqlKeyValueQuery, {
            skip: props => !props.kvUser.isAuthenticated || keys === false, // skip request if user is not logged in
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
        graphql(gqlKeyValueGlobalsQuery, {
            skip: props => !props.kvUser.isAuthenticated || !keysGlobal, // skip request if user is not logged in
            options() {
                return {
                    fetchPolicy: 'cache-and-network',
                }
            },
            props: ({data: {loading, keyValueGlobals}}) => ({
                keyValueGlobals,
                loading
            })
        }),
        graphql(gqlKeyValueUpdate, {
            props: ({ownProps, mutate}) => ({
                setKeyValue: ({key, value, server}) => {
                    if (!key) throw Error('Key is missing in setKeyValue')
                    if (!ownProps.kvUser.isAuthenticated) {
                        return new Promise((res) => {
                            setKeyValueToLS(key, value, server)
                            res()
                        })
                    }
                    const valueStr = value.constructor === String ? value : JSON.stringify(value)
                    const user = ownProps.kvUser.userData
                    return mutate({
                        variables: {key, value: valueStr},
                        optimisticResponse: {
                            __typename: 'Mutation',
                            setKeyValue: {
                                status: 'creating',
                                createdBy: {
                                    _id: user._id,
                                    username: user.username,
                                    __typename: 'UserPublic'
                                },
                                key,
                                value: valueStr,
                                __typename: 'KeyValue'
                            }
                        },
                        update: (proxy, {data: {setKeyValue}}) => {
                            // Read the data from our cache for this query.
                            const data = proxy.readQuery({query: gqlKeyValueQuery})

                            if (!data.keyValues.results) {
                                data.keyValues.results = []
                            }
                            const idx = data.keyValues.results.findIndex(x => x.key === setKeyValue.key && x.createdBy._id === user._id)
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
        graphql(gqlKeyValueGlobalUpdate, {
            props: ({ownProps, mutate}) => ({
                setKeyValueGlobal: ({key, value, server}) => {
                    if (!key) throw Error('Key is missing in setKeyValue')

                    const valueStr = value.constructor === String ? value : JSON.stringify(value)

                    return mutate({
                        variables: {key, value: valueStr},
                        optimisticResponse: {
                            __typename: 'Mutation',
                            setKeyValueGlobal: {
                                status: 'creating',
                                key,
                                value: valueStr,
                                __typename: 'KeyValueGlobal'
                            }
                        },
                        update: (proxy, {data: {setKeyValueGlobal}}) => {
                            // Read the data from our cache for this query.
                            const data = proxy.readQuery({query: gqlKeyValueGlobalsQuery})

                            if (!data.keyValueGlobals.results) {
                                data.keyValueGlobals.results = []
                            }
                            const idx = data.keyValueGlobals.results.findIndex(x => x.key === setKeyValueGlobal.key)
                            if (idx > -1) {
                                data.keyValueGlobals.results[idx].value = setKeyValueGlobal.value
                            } else {
                                data.keyValueGlobals.results.push(setKeyValueGlobal)
                                data.keyValueGlobals.total++;
                            }
                            // Write our data back to the cache.
                            proxy.writeQuery({query: gqlKeyValueGlobalsQuery, data})
                        }
                    })
                }
            })
        }),
        graphql(gqlKeyValueDelete, {
            props: ({ownProps, mutate}) => ({
                deleteKeyValueByKey: ({key}) => {
                    if (!ownProps.kvUser.isAuthenticated) {
                        return new Promise((res) => {
                            setKeyValueToLS(key, null)
                            res()
                        })
                    }
                    return mutate({
                        variables: {key},
                        optimisticResponse: {
                            __typename: 'Mutation',
                            deleteKeyValueByKey: {
                                status: 'deleting',
                                key,
                                __typename: 'KeyValue'
                            }
                        },
                        update: (proxy, {data: {deleteKeyValueByKey}}) => {
                            // Read the data from our cache for this query.
                            const data = proxy.readQuery({query: gqlKeyValueQuery})
                            // Add our note from the mutation to the end.
                            const idx = data.keyValues.results.findIndex(x => x.key === deleteKeyValueByKey.key)
                            if (idx >= 0) {
                                if (deleteKeyValueByKey.status == 'deleting') {
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
    const mapStateToProps = (store) => ({kvUser: store.user})


    /**
     * Connect the component to
     * the Redux store.
     */
    return connect(
        mapStateToProps
    )(WithKeyValuesWithGql)
}
