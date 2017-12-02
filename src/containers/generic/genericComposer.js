import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import {debug} from '../../logger'

export default (container, name, options) => {

    options = {
        limitPerPage: 10,
        query: '_id status createdBy{_id username}',
        ...options
    }

    let insertParams='', insertQuery=''

    if (options.fields) {
        Object.keys(options.fields).map(e => {
            if( insertParams!==''){
                insertParams+=', '
                insertQuery+=', '
            }
            insertParams+='$'+e+': ' + options.fields[e]
            insertQuery+=e+': ' + '$'+e
            options.query += ' ' + e
        })
    }

    const nameStartUpper = name.charAt(0).toUpperCase() + name.slice(1)

    container.propTypes = {
        /* routing params */
        match: PropTypes.object,
        /* apollo client props */
        loading: PropTypes.bool,
        [name + 's']: PropTypes.object,
        ['create' + nameStartUpper]: PropTypes.func.isRequired,
        ['update' + nameStartUpper]: PropTypes.func.isRequired,
        ['delete' + nameStartUpper]: PropTypes.func.isRequired,
        ...container.propTypes
    }


    const gqlQuery = gql`query ${name}s($limit: Int, $offset: Int){${name}s(limit: $limit, offset:$offset){limit offset total results{${options.query}}}}`
    const containerWithGql = compose(
        graphql(gqlQuery, {
            options(ownProps) {
                let pageNr = (ownProps.match.params.page || 1) - 1
                return {
                    variables: {
                        limit: options.limitPerPage,
                        offset: pageNr * options.limitPerPage
                    },
                    fetchPolicy: 'cache-and-network'
                }
            },
            props: ({data}) => ({
                [name + 's']: data[name + 's'],
                loading: data.loading
            })
        }),
        graphql(gql`mutation create${nameStartUpper}(${insertParams}){create${nameStartUpper}(${insertQuery}){${options.query}}}`, {
            props: ({ownProps, mutate}) => ({
                ['create' + nameStartUpper]: (params) => {
                    const oid = '#' + new Date().getTime()
                    return mutate({
                        variables: params,
                        optimisticResponse: {
                            __typename: 'Mutation',
                            // Optimistic message
                            ['create' + nameStartUpper]: {
                                ...params,
                                _id: oid,
                                status: 'creating',
                                createdBy: {
                                    _id: ownProps.user.userData._id,
                                    username: ownProps.user.userData.username,
                                    __typename: 'UserPublic'
                                },
                                __typename: nameStartUpper,
                            }
                        },
                        update: (store, {data}) => {
                            debug('create' + nameStartUpper, data['create' + nameStartUpper])

                            let pageNr = (ownProps.match.params.page || 1) - 1

                            // Read the data from the cache for this query.
                            const storeData = store.readQuery({
                                query: gqlQuery,
                                variables: {limit: options.limitPerPage, offset: pageNr * options.limitPerPage}
                            })
                            if (storeData[name+ 's']) {
                                // remove optimistic id
                                const oIdx = storeData[name+ 's'].results.findIndex((e) => e._id === oid)
                                if( oIdx>-1 ) {
                                    storeData[name+ 's'].results.splice(oIdx,1)
                                    storeData[name+ 's'].total -= 1
                                }
                                if( data['create'+nameStartUpper]) {
                                    storeData[name + 's'].results.unshift(data['create' + nameStartUpper])
                                    storeData[name + 's'].total += 1
                                }
                                store.writeQuery({
                                    query: gqlQuery,
                                    variables: {limit: options.limitPerPage, offset: pageNr * options.limitPerPage},
                                    data: storeData
                                })
                            }
                        }
                    })
                }
            }),
        }),
        graphql(gql`mutation update${nameStartUpper}($_id: ID!,${insertParams}){update${nameStartUpper}(_id:$_id,${insertQuery}){${options.query}}}`, {
            props: ({ownProps, mutate}) => ({
                ['update' + nameStartUpper]: (params) => {
                    return mutate({
                        variables: params,
                        optimisticResponse: {
                            __typename: 'Mutation',
                            // Optimistic message
                            ['update' + nameStartUpper]: {
                                ...params,
                                status: 'updating',
                                createdBy: {
                                    _id: ownProps.user.userData._id,
                                    username: ownProps.user.userData.username,
                                    __typename: 'UserPublic'
                                },
                                __typename: nameStartUpper
                            }
                        },
                        update: (store, {data}) => {
                            debug('update'+nameStartUpper, data['update' + nameStartUpper])
                            let pageNr = (ownProps.match.params.page || 1) - 1

                            // Read the data from the cache for this query.
                            const storeData = store.readQuery({
                                query: gqlQuery,
                                variables: {limit: options.limitPerPage, offset: pageNr * options.limitPerPage}
                            })
                            if( storeData[name+ 's'] ) {
                                const idx = storeData[name+ 's'].results.findIndex(x => x._id === data['update' + nameStartUpper]._id)
                                if (idx > -1) {
                                    storeData[name+ 's'].results[idx] = data['update' + nameStartUpper]
                                    store.writeQuery({
                                        query: gqlQuery,
                                        variables: {limit: options.limitPerPage, offset: pageNr * options.limitPerPage},
                                        data:storeData
                                    })
                                }
                            }
                        }
                    })
                }
            }),
        }),
        graphql(gql`mutation delete${nameStartUpper}($_id: ID!){delete${nameStartUpper}(_id: $_id){_id status}}`, {
            props: ({ownProps, mutate}) => ({
                ['delete' + nameStartUpper]: (params) => {
                    return mutate({
                        variables: params,
                        optimisticResponse: {
                            __typename: 'Mutation',
                            ['delete' + nameStartUpper]: {
                                ...params,
                                status: 'deleting',
                                __typename: 'CmsPage'
                            }
                        },
                        update: (store, {data}) => {
                            debug('delete'+nameStartUpper, data['delete' + nameStartUpper])
                            let pageNr = (ownProps.match.params.page || 1) - 1

                            // Read the data from the cache for this query.
                            const storeData = store.readQuery({
                                query: gqlQuery,
                                variables: {limit: options.limitPerPage, offset: pageNr * options.limitPerPage}
                            })

                            if( storeData[name+ 's'] ) {
                                const idx = storeData[name+ 's'].results.findIndex((e) => e._id === data['delete' + nameStartUpper]._id)
                                if (idx >= 0) {
                                    if (data['delete' + nameStartUpper].status === 'deleting') {
                                        storeData[name+ 's'].results[idx].status = 'deleting'
                                    } else {
                                        storeData[name+ 's'].results.splice(idx, 1)
                                    }
                                    storeData[name+ 's'].total -= 1
                                    store.writeQuery({
                                        query: gqlQuery,
                                        variables: {limit: options.limitPerPage, offset: pageNr * options.limitPerPage},
                                        data:storeData
                                    })
                                }
                            }

                        }
                    })
                }
            })
        })
    )(container)


    /**
     * Map the state to props.
     */
    const mapStateToProps = (store) => {
        const {user} = store
        return {
            user
        }
    }


    /**
     * Connect the component to
     * the Redux store.
     */
    return connect(
        mapStateToProps
    )(containerWithGql)

}