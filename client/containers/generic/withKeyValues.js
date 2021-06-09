import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import {connect} from 'react-redux'
import NetworkStatusHandler from 'client/components/layout/NetworkStatusHandler'
import {getKeyValuesFromLS,
    setKeyValueToLS,
    QUERY_KEY_VALUES,
    QUERY_SET_KEY_VALUE,
    QUERY_KEY_VALUES_GLOBAL,
    QUERY_SET_KEY_VALUE_GLOBAL} from 'client/util/keyvalue'
import {graphql} from '../../middleware/graphql'

const gqlKeyValueDelete = `
          mutation deleteKeyValueByKey($key: String!) {
            deleteKeyValueByKey(key: $key){
                key status
            }
          }`

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
            const keys = Object.keys(nextProps)
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i]
                if (ignoreToCompare.indexOf(key) === -1 && nextProps[key] !== this.props[key]) {
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
                        return <NetworkStatusHandler/>
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

    const WithKeyValuesWithGql = compose(
        graphql(QUERY_KEY_VALUES, {
            skip: props => !props.kvUser.isAuthenticated || !keys, // skip request if user is not logged in
            options() {
                const variables = {keys: keys}
                return {
                    variables,
                    fetchPolicy: 'cache-and-network',
                    nextFetchPolicy: 'cache-first'
                }
            },
            props: ({data: {loading, keyValues}}) => ({
                keyValues,
                loading
            })
        }),
        graphql(QUERY_KEY_VALUES_GLOBAL, {
            skip: props => !props.kvUser.isAuthenticated || !keysGlobal, // skip request if user is not logged in
            options() {

                const variables = {keys: keysGlobal}
                return {
                    variables,
                    fetchPolicy: 'cache-and-network',
                    nextFetchPolicy: 'cache-first'
                }
            },
            props: ({data: {loading, keyValueGlobals}}) => ({
                keyValueGlobals,
                loading
            })
        }),
        graphql(QUERY_SET_KEY_VALUE, {
            props: ({ownProps, mutate}) => ({
                setKeyValue: ({key, value, server}) => {
                    if (!key) throw Error('Key is missing in setKeyValue')
                    if (!ownProps.kvUser.isAuthenticated) {
                        return new Promise((res) => {
                            setKeyValueToLS({key, value, server})
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
                            const variables = {keys: keys}

                            // Read the data from our cache for this query.
                            const storeData = proxy.readQuery({query: QUERY_KEY_VALUES, variables}),
                                storeKeyValue = Object.assign({}, storeData.keyValues)

                            if (!storeKeyValue.results) {
                                storeKeyValue.results = []
                            } else {
                                storeKeyValue.results = [...storeKeyValue.results]
                            }
                            const idx = storeKeyValue.results.findIndex(x => x.key === setKeyValue.key && x.createdBy && x.createdBy._id === user._id)
                            if (idx > -1) {
                                storeKeyValue.results[idx] = Object.assign({
                                    ...storeKeyValue.results[idx],
                                    value: setKeyValue.value
                                })
                            } else {
                                storeKeyValue.results.push(setKeyValue)
                                storeKeyValue.total++;
                            }
                            // Write our data back to the cache.
                            proxy.writeQuery({query: QUERY_KEY_VALUES, variables, data: {...storeData, keyValues: storeKeyValue}})
                        }
                    })
                }
            })
        }),
        graphql(QUERY_SET_KEY_VALUE_GLOBAL, {
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
                            const variables = {keys: keysGlobal}
                            // Read the data from our cache for this query.
                            const storeData = proxy.readQuery({query: QUERY_SET_KEY_VALUE_GLOBAL, variables}),
                                storekeyValueGlobals = Object.assign({}, storeData.keyValueGlobals)

                            if (!storekeyValueGlobals.results) {
                                storekeyValueGlobals.results = []
                            } else {
                                storekeyValueGlobals.results = [...storekeyValueGlobals.results]
                            }

                            const idx = storekeyValueGlobals.results.findIndex(x => x.key === setKeyValueGlobal.key)
                            if (idx > -1) {
                                storekeyValueGlobals.results[idx] = {...storekeyValueGlobals.results[idx], value: setKeyValueGlobal.value}
                            } else {
                                storekeyValueGlobals.results.push(setKeyValueGlobal)
                                storekeyValueGlobals.total++;
                            }
                            // Write our data back to the cache.
                            proxy.writeQuery({query: QUERY_SET_KEY_VALUE_GLOBAL, variables, data: {...storeData, keyValueGlobals: storekeyValueGlobals}})
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
                            setKeyValueToLS({key, value: null})
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

                            const variables = {keys: keys}

                            // Read the data from our cache for this query.
                            const storeData = proxy.readQuery({query: QUERY_KEY_VALUES, variables}),
                            storeKeyValue = Object.assign({}, storeData.keyValues)

                            if (storeKeyValue.results) {
                                storeKeyValue.results = [...storeKeyValue.results]

                                // Add our note from the mutation to the end.
                                const idx = storeKeyValue.results.findIndex(x => x.key === deleteKeyValueByKey.key)
                                if (idx >= 0) {
                                    if (deleteKeyValueByKey.status == 'deleting') {
                                        storeKeyValue.results[idx] = {...storeKeyValue.results[idx],status: 'deleting'}
                                    } else {
                                        storeKeyValue.results.splice(idx, 1)
                                    }
                                    proxy.writeQuery({query: QUERY_KEY_VALUES, variables, data: {...storeData, keyValues: storeKeyValue}})
                                }
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
