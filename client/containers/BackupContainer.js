import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import BaseLayout from 'client/components/layout/BaseLayout'
import {
    SimpleButton,
    SimpleDialog,
    Typography,
    DeleteIconButton,
    SimpleList,
    Row,
    Col
} from 'ui/admin'
import FileDrop from 'client/components/FileDrop'
import Util from 'client/util'
import config from 'gen/config'
import {graphql, client} from '../middleware/graphql'

const {BACKUP_URL} = config


class BackupContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            creatingDump: false,
            creatingMediaDump: false,
            creatingHostruleDump: false,
            importingDbDump: false,
            importingMediaDump: false,
            importMediaDumpDialog: false,
            importDbDumpDialog: false,
            importHostruleDumpDialog: false
        }
    }

    createDump() {
        this.setState({creatingDump: true})
        this.props.createBackup({type:'db'}).then(e => {
            this.setState({creatingDump: false})
        })

    }

    createMediaDump() {
        this.setState({creatingMediaDump: true})
        this.props.createBackup({type:'media'}).then(e => {
            this.setState({creatingMediaDump: false})
        })
    }

    createHostruleDump() {
        this.setState({creatingHostruleDump: true})
        this.props.createBackup({type:'hostrule'}).then(e => {
            this.setState({creatingHostruleDump: false})
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


    download(content, filename, contentType) {
        if (!contentType) contentType = 'application/octet-stream';
        var a = document.createElement('a');
        var blob = new Blob([content], {'type': contentType});
        a.href = window.URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    }

    authorizedRequest(url, name) {
        const xhr = new XMLHttpRequest

        xhr.open("GET", url)
        xhr.responseType = 'blob'

        xhr.addEventListener("load", () => {
            if (xhr.status === 200) {

                this.download(xhr.response, name, 'application/gzip')
            } else {

                alert(`Invalid status ${xhr.status}`)
            }
        }, false)

        const token = Util.getAuthToken()
        if(token) {
            xhr.setRequestHeader('Authorization', token)
        }
        xhr.send(null)
    }

    render() {
        const {dbDumps, mediaDumps, hostruleDumps} = this.props
        const {creatingDump, creatingMediaDump, creatingHostruleDump, importingMediaDump, importMediaDumpDialog, importDbDumpDialog, importHostruleDumpDialog, importingDbDump} = this.state
        return (
            <BaseLayout>
                <Typography variant="h3" gutterBottom>Backups</Typography>

                <Row spacing={4}>
                    <Col md={4}>

                        <SimpleButton variant="contained" color="primary"
                                      showProgress={creatingDump}
                                      onClick={this.createDump.bind(this)}>{creatingDump ? 'Dump is beeing created' : 'Create db dump'}</SimpleButton>

                        <SimpleButton color="secondary"
                                      disabled={importDbDumpDialog}
                                      showProgress={importingDbDump}
                                      onClick={this.importDbDump.bind(this)}>{importingDbDump ? 'Dump is beeing restored' : 'Restore db dump'}</SimpleButton>

                        {dbDumps && dbDumps.results && dbDumps.results.length > 0 &&
                        <SimpleList items={dbDumps.results.reduce((a, i) => {
                            if(i) {
                                a.push({
                                    primary: i.name,
                                    onClick: () => {

                                        this.authorizedRequest(BACKUP_URL + '/dbdumps/' + i.name, 'db.backup.gz')

                                    },
                                    secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size,
                                    actions: <DeleteIconButton onClick={() => {
                                        this.props.removeBackup({name:i.name,type:'db'})
                                    }}/>
                                })
                            }
                            return a
                        }, [])}/>
                        }
                    </Col>

                    <Col md={4}>

                        <SimpleButton variant="contained" color="primary"
                                      disabled={importMediaDumpDialog}
                                      showProgress={creatingMediaDump}
                                      onClick={this.createMediaDump.bind(this)}>{creatingMediaDump ? 'Dump is beeing created' : 'Create media dump'}</SimpleButton>

                        <SimpleButton color="secondary"
                                      showProgress={importingMediaDump}
                                      onClick={this.importMediaDump.bind(this)}>{importingMediaDump ? 'Dump is beeing imported' : 'Import media dump'}</SimpleButton>


                        {mediaDumps && mediaDumps.results && mediaDumps.results.length > 0 &&
                        <SimpleList items={mediaDumps.results.reduce((a, i) => {
                            a.push({
                                primary: i.name,
                                onClick: () => {
                                    this.authorizedRequest(BACKUP_URL + '/mediadumps/' + i.name, 'medias.backup.gz')
                                },
                                secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size,
                                actions: <DeleteIconButton onClick={()=>{
                                    this.props.removeBackup({name:i.name,type:'media'})
                                }}/>
                            })
                            return a
                        }, [])}/>
                        }
                    </Col>


                    <Col md={4}>

                        <SimpleButton variant="contained" color="primary"
                                      disabled={importHostruleDumpDialog}
                                      showProgress={creatingHostruleDump}
                                      onClick={this.createHostruleDump.bind(this)}>{creatingHostruleDump ? 'Dump is beeing created' : 'Create hostrule dump'}</SimpleButton>


                        {hostruleDumps && hostruleDumps.results && hostruleDumps.results.length > 0 &&
                        <SimpleList items={hostruleDumps.results.reduce((a, i) => {
                            a.push({
                                primary: i.name,
                                onClick: () => {
                                    this.authorizedRequest(BACKUP_URL + '/hostruledumps/' + i.name, 'hostrule.backup.gz')
                                },
                                secondary: Util.formattedDatetime(i.createdAt) + ' - ' + i.size,
                                actions: <DeleteIconButton onClick={()=>{
                                    this.props.removeBackup({name:i.name,type:'hostrule'})
                                }}/>
                            })
                            return a
                        }, [])}/>
                        }
                    </Col>
                </Row>

                <SimpleDialog open={importMediaDumpDialog} onClose={this.handleConfirmMediaDialog.bind(this)}
                              actions={[{key: 'close', label: 'Close'}]}
                              title="Select a media dump file">

                    <FileDrop maxSize={10000000} style={{width: '15rem', height: '10rem'}} accept="application/x-gzip"
                              uploadTo="/graphql/upload/mediadump"
                              label="Drop file here"/>

                </SimpleDialog>

                <SimpleDialog open={importDbDumpDialog} onClose={this.handleConfirmDbDialog.bind(this)}
                              actions={[{key: 'close', label: 'Close'}]}
                              title="Select a db dump file">

                    <FileDrop maxSize={10000000} style={{width: '15rem', height: '10rem'}} accept="application/x-gzip"
                              uploadTo="/graphql/upload/dbdump"
                              label="Drop file here"/>

                </SimpleDialog>

            </BaseLayout>
        )
    }
}


BackupContainer.propTypes = {
    dbDumps: PropTypes.object,
    createBackup: PropTypes.func.isRequired,
    removeBackup: PropTypes.func.isRequired,
    loading: PropTypes.bool,
    mediaDumps: PropTypes.object,
    hostruleDumps: PropTypes.object
}

const gqlQuery = `query backups($type:String!){backups(type:$type){results{name createdAt size}}}`
const gqlUpdate = `mutation createBackup($type:String!){createBackup(type:$type){name createdAt size}}`
const gqlRemove = `mutation removeBackup($type:String!,$name:String!){removeBackup(type:$type,name:$name){status}}`

const BackupContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                variables: {type: 'db'},
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {backups}}) => ({
            dbDumps: backups
        })
    }),
    graphql(gqlQuery, {
        options() {
            return {
                variables: {type: 'media'},
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {backups}}) => ({
            mediaDumps: backups
        })
    }),
    graphql(gqlQuery, {
        options() {
            return {
                variables: {type: 'hostrule'},
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {backups}}) => ({
            hostruleDumps: backups
        })
    }),
    graphql(gqlUpdate, {
        props: ({mutate}) => ({
            createBackup: ({type}) => {
                return mutate({
                    variables: {type},
                    update: (proxy, {data: {createBackup}}) => {
                        if(!createBackup.errors) {
                            // Read the data from our cache for this query.
                            const storeData = proxy.readQuery({query: gqlQuery, variables: {type}}) || {}
                            if (!storeData.backups) {
                                storeData.backups = {}
                            }
                            const newData = {...storeData.backups, results: [...storeData.backups.results]}

                            newData.results.unshift(createBackup)

                            // Write our data back to the cache.
                            proxy.writeQuery({
                                query: gqlQuery,
                                variables: {type},
                                data: {...storeData, backups: newData}
                            })
                        }
                    }

                })
            }
        })
    }),
    graphql(gqlRemove, {
        props: ({mutate}) => ({
            removeBackup: ({name, type}) => {
                return mutate({
                    variables: {name, type},
                    update: (proxy, {data: {removeBackup}}) => {
                        // Read the data from our cache for this query.
                        const storeData = proxy.readQuery({query: gqlQuery, variables:{type}})

                        const newData = {...storeData.backups, results: [...storeData.backups.results]}

                        const idx = newData.results.findIndex(x => x.name === name)
                        if (idx > -1) {
                            newData.results.splice(idx, 1)
                            proxy.writeQuery({query: gqlQuery, variables:{type}, data: {...storeData, backups: newData}})
                        }
                    }

                })
            }
        })
    })
)
(BackupContainer)


/**
 * Connect the component to
 * the Redux store.
 */
export default BackupContainerWithGql
