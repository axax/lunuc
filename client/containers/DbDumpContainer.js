import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'
import {SimpleButton, Typography, TextField, Divider, DeleteIconButton, Chip, SimpleList, Row, Col} from 'ui/admin'
import Util from 'client/util'
import config from 'gen/config'

const {BACKUP_URL} = config


class DbDumpContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            creatingDump: false,
            creatingMediaDump: false,
            importingMediaDump: false
        }
    }

    createDump() {
        this.setState({creatingDump: true})
        this.props.createDbDump().then(e => {
            console.log(e)
            this.setState({creatingDump: false})
        })

    }

    createMediaDump() {
        this.setState({creatingMediaDump: true})
        this.props.createMediaDump().then(e => {
            console.log(e)
            this.setState({creatingMediaDump: false})
        })

    }
    importMediaDump() {
        this.setState({importMediaDump: true})
        this.props.createMediaDump().then(e => {
            this.setState({importMediaDump: false})
        })

    }

    render() {
        const {dbDumps, mediaDumps} = this.props
        const {creatingDump, creatingMediaDump, importingMediaDump} = this.state
        return (
            <BaseLayout>
                <Typography variant="display2" gutterBottom>Backups</Typography>

                <Row spacing={32}>
                    <Col md={6}>

                        <SimpleButton variant="raised" color="primary"
                                      showProgress={creatingDump}
                                      onClick={this.createDump.bind(this)}>{creatingDump ? 'Dump is beeing created' : 'Create new db dump'}</SimpleButton>


                        {dbDumps && dbDumps.results && dbDumps.results.length > 0 &&
                        <SimpleList items={dbDumps.results.reduce((a, i) => {
                            a.push({
                                primary: i.name,
                                onClick: () => {
                                    window.location.href = BACKUP_URL + '/dbdumps/' + i.name
                                    //history.push(ADMIN_BASE_URL + '/post/' + post._id)
                                },
                                secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size
                            })
                            return a
                        }, [])}/>
                        }
                    </Col>

                    <Col md={6}>

                        <SimpleButton variant="raised" color="primary"
                                      showProgress={creatingMediaDump}
                                      onClick={this.createMediaDump.bind(this)}>{creatingMediaDump ? 'Dump is beeing created' : 'Create new media dump'}</SimpleButton>

                        <SimpleButton color="secondary"
                                      showProgress={importingMediaDump}
                                      onClick={this.importMediaDump.bind(this)}>{importingMediaDump ? 'Dump is beeing imported' : 'Import media dump'}</SimpleButton>


                        {mediaDumps && mediaDumps.results && mediaDumps.results.length > 0 &&
                        <SimpleList items={mediaDumps.results.reduce((a, i) => {
                            a.push({
                                primary: i.name,
                                onClick: () => {
                                    window.location.href = BACKUP_URL + '/mediadumbs/' + i.name
                                    //history.push(ADMIN_BASE_URL + '/post/' + post._id)
                                },
                                secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size
                            })
                            return a
                        }, [])}/>
                        }
                    </Col>
                </Row>

            </BaseLayout>
        )
    }
}


DbDumpContainer.propTypes = {
    /* apollo client props */
    dbDumps: PropTypes.object,
    createDbDump: PropTypes.func.isRequired,
    createMediaDump: PropTypes.func.isRequired,
    loading: PropTypes.bool
}

const gqlQuery = gql`query{dbDumps{results{name createdAt size}}}`
const gqlUpdate = gql`mutation createDbDump($type:String){createDbDump(type:$type){name createdAt size}}`
const gqlQueryMedia = gql`query{mediaDumps{results{name createdAt size}}}`
const gqlUpdateMedia = gql`mutation createMediaDump($type:String){createMediaDump(type:$type){name createdAt size}}`

const DbDumpContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {dbDumps}}) => ({
            dbDumps
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
    }),
    graphql(gqlQueryMedia, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {mediaDumps}}) => ({
            mediaDumps
        })
    }),
    graphql(gqlUpdateMedia, {
        props: ({mutate}) => ({
            createMediaDump: () => {
                return mutate({
                    variables: {type: 'full'},
                    update: (proxy, {data: {createMediaDump}}) => {
                        // Read the data from our cache for this query.
                        const data = proxy.readQuery({query: gqlQueryMedia})
                        // Add our note from the mutation to the end.
                        data.mediaDumps.results.unshift(createMediaDump)
                        // Write our data back to the cache.
                        proxy.writeQuery({query: gqlQueryMedia, data})
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