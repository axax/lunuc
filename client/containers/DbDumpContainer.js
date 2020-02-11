import React from 'react'
import PropTypes from 'prop-types'
import {graphql} from 'react-apollo'
import compose from 'util/compose'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'
import {
    SimpleButton,
    SimpleDialog,
    Typography,
    TextField,
    Divider,
    DeleteIconButton,
    Chip,
    SimpleList,
    Row,
    Col
} from 'ui/admin'
import FileDrop from 'client/components/FileDrop'
import Util from 'client/util'
import config from 'gen/config'

const {BACKUP_URL} = config


class DbDumpContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            creatingDump: false,
            creatingMediaDump: false,
            importingDbDump: false,
            importingMediaDump: false,
            importMediaDumpDialog: false,
            importDbDumpDialog: false
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
        this.setState({importMediaDumpDialog: true})
    }

    importDbDump() {
        this.setState({importDbDumpDialog: true})
    }

    handleConfirmMediaDialog() {
        this.setState({importMediaDumpDialog: false})
    }

    handleConfirmDbDialog() {
        this.setState({importDbDumpDialog: false})
    }

    handleMediaDumpUpload(e) {
        console.log(e)
    }


    download(content, filename, contentType)
    {
        if(!contentType) contentType = 'application/octet-stream';
        var a = document.createElement('a');
        var blob = new Blob([content], {'type':contentType});
        a.href = window.URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    }

    authorizedRequest(url, name){
        const xhr = new XMLHttpRequest

        xhr.open("GET",url)
        xhr.responseType = 'blob'

        xhr.addEventListener("load", () => {
            if( xhr.status === 200) {

                this.download(xhr.response, name, 'application/gzip')
            }else{

                alert(`Invalid status ${xhr.status}`)
            }
        }, false)

        xhr.setRequestHeader('Authorization', Util.getAuthToken())
        // xhr.overrideMimeType( "application/octet-stream; charset=x-user-defined;" )
        xhr.send(null)
    }

    render() {
        const {dbDumps, mediaDumps} = this.props
        const {creatingDump, creatingMediaDump, importingMediaDump, importMediaDumpDialog, importDbDumpDialog, importingDbDump} = this.state
        return (
            <BaseLayout>
                <Typography variant="h3" gutterBottom>Backups</Typography>

                <Row spacing={4}>
                    <Col md={6}>

                        <SimpleButton variant="contained" color="primary"
                                      showProgress={creatingDump}
                                      onClick={this.createDump.bind(this)}>{creatingDump ? 'Dump is beeing created' : 'Create new db dump'}</SimpleButton>

                        <SimpleButton color="secondary"
                                      disabled={importDbDumpDialog}
                                      showProgress={importingDbDump}
                                      onClick={this.importDbDump.bind(this)}>{importingDbDump ? 'Dump is beeing restored' : 'Restore db dump'}</SimpleButton>

                        {dbDumps && dbDumps.results && dbDumps.results.length > 0 &&
                        <SimpleList items={dbDumps.results.reduce((a, i) => {
                            a.push({
                                primary: i.name,
                                onClick: () => {

                                    this.authorizedRequest(BACKUP_URL + '/dbdumps/' + i.name, 'db.backup.gz' )

                                },
                                secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size
                            })
                            return a
                        }, [])}/>
                        }
                    </Col>

                    <Col md={6}>

                        <SimpleButton variant="contained" color="primary"
                                      disabled={importMediaDumpDialog}
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
                                    this.authorizedRequest(BACKUP_URL + '/mediadumbs/' + i.name, 'medias.backup.gz' )
                                },
                                secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size
                            })
                            return a
                        }, [])}/>
                        }
                    </Col>
                </Row>

                <SimpleDialog open={importMediaDumpDialog} onClose={this.handleConfirmMediaDialog.bind(this)}
                              actions={[{key: 'close', label: 'Close'}]}
                              title="Select a media dump file">

                    <FileDrop style={{width: '15rem', height: '10rem'}} accept="application/x-gzip"
                              uploadTo="/graphql/upload/mediadump"
                              label="Drop file here"/>

                </SimpleDialog>

                <SimpleDialog open={importDbDumpDialog} onClose={this.handleConfirmDbDialog.bind(this)}
                              actions={[{key: 'close', label: 'Close'}]}
                              title="Select a db dump file">

                    <FileDrop style={{width: '15rem', height: '10rem'}} accept="application/x-gzip"
                              uploadTo="/graphql/upload/dbdump"
                              label="Drop file here"/>

                </SimpleDialog>

            </BaseLayout>
        )
    }
}


DbDumpContainer.propTypes = {
    /* apollo client props */
    dbDumps: PropTypes.object,
    createDbDump: PropTypes.func.isRequired,
    createMediaDump: PropTypes.func.isRequired,
    loading: PropTypes.bool,
    mediaDumps: PropTypes.object
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
