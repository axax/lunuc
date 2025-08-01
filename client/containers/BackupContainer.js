import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import {
    SimpleButton,
    SimpleDialog,
    SimpleList,
    Typography,
    DeleteIconButton,
    ShieldIcon,
    LinkIcon,
    Row,
    Col
} from 'ui/admin'
import FileDrop from 'client/components/FileDrop'
import Util from 'client/util/index.mjs'
import {graphql, Query} from '../middleware/graphql'
import {getTypes} from '../../util/types.mjs'
import {_t} from 'util/i18n.mjs'


class BackupContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            creatingDump: false,
            creatingMediaDump: false,
            creatingHostruleDump: false,
            importingDbDump: false,
            importingMediaDump: false,
            importingHostruleDump: false,
            importMediaDumpDialog: false,
            importDbDumpDialog: false,
            importHostruleDumpDialog: false,
            linkDialog: {open:false},
            createDumpDialog: {open:false}
        }
        const types = getTypes()
        this.typesToSelect = []
        Object.keys(types).sort().map((k) => {
            this.typesToSelect.push({primary: k,checkbox:true,checked:true})
        })
    }

    createDump(options) {
        this.setState({creatingDump: true})
        this.props.createBackup({type:'db', options: options?JSON.stringify(options):undefined}).then(e => {
            this.setState({creatingDump: false})
        }).catch(()=>{
            this.setState({creatingDump: false})
        })

    }

    createMediaDump() {
        this.setState({creatingMediaDump: true})
        this.props.createBackup({type:'media'}).then(e => {
            this.setState({creatingMediaDump: false})
        }).catch(()=>{
            this.setState({creatingMediaDump: false})
        })
    }

    createHostruleDump() {
        this.setState({creatingHostruleDump: true})
        this.props.createBackup({type:'hostrule'}).then(e => {
            this.setState({creatingHostruleDump: false})
        }).catch(()=>{
            this.setState({creatingHostruleDump: false})
        })
    }

    importMediaDump() {
        this.setState({importMediaDumpDialog: true})
    }

    importHostruleDump() {
        this.setState({importHostruleDumpDialog: true})
    }

    importDbDump() {
        this.setState({importDbDumpDialog: true})
    }

    handleConfirmMediaDialog() {
        this.setState({importMediaDumpDialog: false})
    }

    handleConfirmHostruleDialog() {
        this.setState({importHostruleDumpDialog: false})
    }

    handleConfirmDbDialog() {
        this.setState({importDbDumpDialog: false})
    }

    handleLinkDialog() {
        this.setState({linkDialog: {...this.state.linkDialog,open:false}})
    }

    handleCreateDumpDialog(action) {
        if(action.key === 'create'){
            const excludeCollection = this.typesToSelect.filter(type=>!type.checked).map(type=>type.primary)
            this.createDump({excludeCollection})
        }
        this.setState({createDumpDialog: {...this.state.createDumpDialog,open:false}})
    }


    download(content, filename, contentType) {
        if (!contentType) contentType = 'application/octet-stream'
        const a = document.createElement('a')
        const blob = new Blob([content], {'type': contentType})
        a.href = window.URL.createObjectURL(blob)
        a.download = filename
        a.click()
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
        const {createDumpDialog, linkDialog, creatingDump, creatingMediaDump, creatingHostruleDump, importingMediaDump, importingHostruleDump, importMediaDumpDialog, importDbDumpDialog, importHostruleDumpDialog, importingDbDump} = this.state
        return <>
                <Typography variant="h3" gutterBottom>Backups</Typography>

                <Row spacing={4}>
                    <Col md={4}>

                        <SimpleButton variant="contained" color="primary"
                                      showProgress={creatingDump}
                                      onClick={()=>{
                                          this.setState({createDumpDialog: {
                                              open:true
                                          }})
                                      }}>{creatingDump ? 'Dump is beeing created' : 'Create db dump'}</SimpleButton>

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
                                        this.setState({linkDialog: {
                                                open:true,
                                                fileName: i.name,
                                                filePath:'/backups/dbdumps/',
                                                downloadName: 'db.backup.gz'
                                        }})
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
                                    this.setState({linkDialog: {
                                        open:true,
                                        fileName: i.name,
                                        filePath:'/backups/mediadumps/',
                                        downloadName: 'medias.backup.gz'
                                    }})
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


                        <SimpleButton color="secondary"
                                      showProgress={importingHostruleDump}
                                      onClick={this.importHostruleDump.bind(this)}>{importingHostruleDump ? 'Dump is beeing imported' : 'Import hostrule dump'}</SimpleButton>


                        {hostruleDumps && hostruleDumps.results && hostruleDumps.results.length > 0 &&
                        <SimpleList items={hostruleDumps.results.reduce((a, i) => {
                            a.push({
                                primary: i.name,
                                onClick: () => {
                                    this.setState({linkDialog: {
                                        open:true,
                                        fileName: i.name,
                                        filePath:'/backups/hostruledumps/',
                                        downloadName: 'hostrule.backup.gz'
                                    }})
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


                <SimpleDialog open={linkDialog.open} onClose={this.handleLinkDialog.bind(this)}
                              actions={[{key: 'close', label: 'Close'}]}
                              title={'Secure Link for '+linkDialog.fileName}>
                    {linkDialog.filePath && <Query query="query getTokenLink($filePath:String){getTokenLink(filePath:$filePath){token}}"
                           fetchPolicy="no-cache"
                           variables={{filePath:linkDialog.filePath+linkDialog.fileName}}>
                        {({loading, error, data}) => {
                            if (loading) return 'Loading...'
                            if (error) return `Error! ${error.message}`

                            return  <>
                                <div style={{marginBottom:'1rem',padding:'1rem',border:'dashed 1px #cccccc',wordBreak: 'break-all'}}>
                                    {`${location.origin}/tokenlink/${data.getTokenLink.token}/-/${linkDialog.downloadName}`}
                                </div>
                                <SimpleList items={[{
                                        onClick:()=>{
                                            window.open(`/tokenlink/${data.getTokenLink.token}/-/${linkDialog.downloadName}`, '_blank').focus();
                                        },
                                        icon: <LinkIcon></LinkIcon>,
                                        primary:'Click to download',
                                        secondary: 'Link expires in 5 hours'
                                    },
                                    {
                                        onClick:()=>{
                                            this.authorizedRequest(linkDialog.filePath+linkDialog.fileName, linkDialog.downloadName)
                                        },
                                        icon: <ShieldIcon></ShieldIcon>,
                                        primary:'Download via auth token',
                                        secondary: ''
                                    }]}/></>
                        }}
                    </Query>}
                </SimpleDialog>

                <SimpleDialog fullWidth={true} maxWidth="md"
                              open={createDumpDialog.open} onClose={this.handleCreateDumpDialog.bind(this)}
                              actions={[{key: 'close', label: 'Cancel', type:'secondary'},{key: 'create', label: 'Create', variant:'contained',type: 'primary'}]}
                              title={'Create db dump'}>


                    <Typography variant="h6" color="inherit">
                        {_t('BackupContainer.includedCollections')}
                    </Typography>
                    <SimpleList
                        onCheck={(checked)=>{
                            this.typesToSelect.forEach((type,index)=>{
                                type.checked = checked.indexOf(index)>=0
                            })
                        }}
                        sx={{
                        overflow: 'auto',
                        maxHeight: 300
                    }} allChecked={true} items={this.typesToSelect}/>

                </SimpleDialog>

                <SimpleDialog open={importHostruleDumpDialog} onClose={this.handleConfirmHostruleDialog.bind(this)}
                              actions={[{key: 'close', label: 'Close'}]}
                              title="Select a hostrule dump file">

                    <FileDrop maxSize={10000000} style={{width: '15rem', height: '10rem'}} accept="application/x-gzip"
                              uploadTo="/graphql/upload/hostrule"
                              label="Drop file here"/>

                </SimpleDialog>

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
            </>
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
const gqlUpdate = `mutation createBackup($type:String!,$options:String){createBackup(type:$type,options:$options){name createdAt size}}`
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
            createBackup: ({type, options}) => {
                return mutate({
                    variables: {type, options},
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

export default BackupContainerWithGql
