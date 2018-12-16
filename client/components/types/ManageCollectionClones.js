import React from 'react'
import PropTypes from 'prop-types'
import {
    DeleteIconButton,
    SimpleList
} from 'ui/admin'
import Util from 'client/util'
import {withApollo, Query} from 'react-apollo'
import gql from 'graphql-tag'
import ApolloClient from 'apollo-client'
import {COLLECTIONS_QUERY} from '../../constants'
const gqlCollectionsQuery = gql(COLLECTIONS_QUERY)


class ManageCollectionClones extends React.PureComponent {
    state = {
    }

    /*static getDerivedStateFromProps(nextProps, prevState) {
        if (!prevState.loaded) {
            return Object.assign({}, prevState, {loading: true})
        }
        return prevState
    }*/

    handleDeleteClick(item){
        console.log(item)
    }

    render() {

        const {type} = this.props

        return <Query query={gqlCollectionsQuery}
                   fetchPolicy="cache-first"
                   variables={{filter: '^' + type + '_.*'}}>
                {({loading, error, data}) => {
                    if (loading) return 'Loading...'
                    if (error) return `Error! ${error.message}`

                    if (!data.collections.results) return null

                    const listItems = data.collections.results.reduce((a, item) => {
                        const value = item.name.substring(item.name.indexOf('_') + 1), parts = value.split('_')

                        a.push({
                            selected: false,
                            primary:  (parts.length > 1 ? parts[1] : 'no name'),
                            onClick: (e) => {
                                console.log(e)
                                // this.goTo(post._id, posts.page, posts.limit, this.filter)
                            },
                            secondary: Util.formattedDatetime(parts[0]),
                            actions: <DeleteIconButton onClick={this.handleDeleteClick.bind(this, item)}/>,
                        })
                        return a
                    }, [])

                    return <SimpleList items={listItems}
                                       count={listItems.length}/>
                }}
            </Query>
    }
}


ManageCollectionClones.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    type: PropTypes.string.isRequired
}


/**
 * Make ApolloClient accessable
 */
export default withApollo(ManageCollectionClones)