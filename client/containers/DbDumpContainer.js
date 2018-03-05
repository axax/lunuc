import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'
import {SimpleButton, Typography, TextField, Divider, DeleteIconButton, Chip, SimpleList} from 'ui/admin'
import Util from 'client/util'
import config from 'gen/config'

const {BACKUP_URL} = config


class DbDumpContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            creatingDump: false
        }
    }

    createDump() {
        this.setState({creatingDump: true})
        this.props.createDbDump().then(e => {
            console.log(e)
            this.setState({creatingDump: false})
        })

    }

    render() {
        const {dbDumps} = this.props
        const {creatingDump} = this.state
        return (
            <BaseLayout>
                <Typography variant="display2" gutterBottom>Backup</Typography>

                <SimpleButton variant="raised" color="primary"
                              showProgress={creatingDump}
                              onClick={this.createDump.bind(this)}>{creatingDump ? 'Dump is beeing created' : 'Create new dump'}</SimpleButton>


                {dbDumps &&
                <SimpleList items={dbDumps.results.reduce((a, i) => {
                    a.push({
                        primary: i.name,
                        onClick: () => {
                            window.location.href = BACKUP_URL + '/' + i.name
                            //history.push(ADMIN_BASE_URL + '/post/' + post._id)
                        },
                        secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size
                    })
                    return a
                }, [])}/>
                }


            </BaseLayout>
        )
    }
}


DbDumpContainer.propTypes = {
    /* apollo client props */
    dbDumps: PropTypes.object,
    createDbDump: PropTypes.func.isRequired,
    loading: PropTypes.bool
}

const gqlQuery = gql`query {dbDumps{results{name createdAt size}}}`
const gqlUpdate = gql`mutation createDbDump($type: String){ createDbDump(type:$type){name createdAt size}}`

const DbDumpContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, dbDumps}}) => ({
            dbDumps,
            loading
        })
    }),
    graphql(gqlUpdate, {
        props: ({mutate}) => ({
            createDbDump: () => {
                return mutate({
                    variables: {type: 'full'},
                    update: (proxy, {data: {createDbDump}}) => {
                        // Read the data from our cache for this query.
                        const data = proxy.readQuery({query: gqlQuery})
                        // Add our note from the mutation to the end.
                        data.dbDumps.results.unshift(createDbDump)
                        // Write our data back to the cache.
                        proxy.writeQuery({query: gqlQuery, data})
                    }

                })
            }
        })
    })
)
(DbDumpContainer)


/**
 * Connect the component to
 * the Redux store.
 */
export default DbDumpContainerWithGql