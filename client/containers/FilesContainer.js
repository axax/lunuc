import React from 'react'
import {
    Typography,
    TextField,
    SimpleList,
    SimpleSelect,
    SimpleDialog,
    SimpleMenu,
    Row,
    Col,
    FolderIcon,
    InsertDriveFileIcon
} from 'ui/admin'
import Util from 'client/util/index.mjs'
import {formatBytes} from 'client/util/format.mjs'
import {COMMAND_QUERY} from '../constants/index.mjs'
import PropTypes from 'prop-types'
import config from 'gen/config-client'
import {Query, client} from '../middleware/graphql'
import FileDrop from '../components/FileDrop'
import Async from '../components/Async'
import {_t} from 'util/i18n.mjs'
import styled from '@emotion/styled'


const StyledTextField = styled(TextField)(() => ({
    input: {
        '&:invalid': {
            border: 'red solid 1px'
        }
    }
}))

const EXTENSIONS_TO_EDIT = ['','html','js','md','cjs','mjs','text','txt','yml','json','xml','csv','template']

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../components/CodeEditor')}/>

class FilesContainer extends React.Component {

    static spaces = [{value:'./',name:'Application'},
        {value:config.HOSTRULES_ABSPATH,name:'Hostrules'},
        {value:config.WEBROOT_ABSPATH,name:'Webroot'},
        {value:'/etc/lunuc/',name:'Config (etc)'},
        ]
    constructor(props) {
        super(props)
        const params = Util.extractQueryParams()
        this.state = {
            file: props.file,
            dir: params.dir || '',
            searchText: '',
            filterText:'',
            space: props.space || params.space || './',
            confirmDeletionDialog:{open:false},
            nameFileDialog:{open:false}
        }
    }


    render() {
        const {embedded, editOnly, history} = this.props
        const {file, fileSize, dir, searchText, filterText, space,confirmDeletionDialog,nameFileDialog} = this.state
        //let command = 'ls -l ' + space + dir
        let command = `if [[ "$OSTYPE" == "darwin"* ]]; then 
  ls -l -D"%Y-%m-%dT%H:%M:%S" "${space + dir}"
else
   ls -l --time-style="+%Y-%m-%dT%H:%M:%S" "${space + dir}"
fi`
        if (searchText) {
            command = `find ${space+dir} -size -1M -type f -name '*.*' ! -path "./node_modules/*" ! -path "./bower_components/*" -exec grep -ril "${searchText}" {} \\;`
        }

        let fileEditor

        if(file){
            const ext = file.slice((file.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase()
            if(fileSize>10000 || EXTENSIONS_TO_EDIT.indexOf(ext)<0){
                fileEditor = <Query query="query getTokenLink($filePath:String!){getTokenLink(filePath:$filePath){token}}" fetchPolicy="no-cache"
                                    variables={{filePath:`/${space+dir}/${file}`}}>
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`

                        return  <a target="_blank" href={`${location.origin}/tokenlink/${data.getTokenLink.token}/-/${file}`}>Download {file} ({formatBytes(fileSize)})</a>
                    }}
                </Query>
            }else{
                fileEditor = <Query query={COMMAND_QUERY} fetchPolicy="cache-and-network"
                                    variables={{sync: true, command: 'less -f -L ' + space + dir + '/' + file}}>
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`
                        if (!data.run) return 'No data'
                        const ext = file.slice((file.lastIndexOf('.') - 1 >>> 0) + 2)
                        return <CodeEditor lineNumbers controlled={false} height="50rem" onChange={c => {
                            this.fileChange(space + dir + '/' + file, c)
                        }} type={ext || 'text'}>{data.run.response}</CodeEditor>
                    }}
                </Query>
            }
        }

        let content

        if (editOnly) {
            content = fileEditor
        } else {
            content = <Row spacing={3}>
                <Col sm={4}>
                    <SimpleDialog open={confirmDeletionDialog.open} onClose={(e)=>{
                        const fileName = confirmDeletionDialog.fileName

                        if(e.key==='yes') {
                            client.query({
                                fetchPolicy: 'no-cache',
                                query: COMMAND_QUERY,
                                variables: {
                                    sync: true,
                                    command: `rm -r "${space}${dir}/${fileName}"`
                                }

                            }).then(response => {
                                console.log(response)
                                _app_.dispatcher.addNotification({key: 'fileChange', message: `File "${fileName}" removed`})
                                client.clearCache({query:COMMAND_QUERY,variables:{sync: true, command}})
                               console.log('before refresh')
                                this.forceUpdate()

                            })
                        }
                        this.setState({confirmDeletionDialog: {...confirmDeletionDialog, open: false}})
                    }}
                                  actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                                  title="Confirm deletion">{_t('FilesContainer.confirmDeletion',confirmDeletionDialog)}</SimpleDialog>
                    <SimpleDialog open={nameFileDialog.open} onClose={(e)=>{

                        if(e.key==='save') {
                            if(nameFileDialog.input.checkValidity()) {
                                client.query({
                                    fetchPolicy: 'no-cache',
                                    query: COMMAND_QUERY,
                                    variables: {
                                        sync: true,
                                        command: `${nameFileDialog.isFolder?'mkdir':'touch'} "${space}${dir}/${nameFileDialog.input.value}"`
                                    }

                                }).then(response => {
                                    console.log(response)
                                    _app_.dispatcher.addNotification({key: 'fileChange', message: `${nameFileDialog.isFolder?'Folder':'File'} "${nameFileDialog.input.value}" created`})
                                    client.clearCache({query:COMMAND_QUERY,variables:{sync: true, command}})
                                    console.log('before refresh')
                                    this.setState({nameFileDialog: {open: false}})

                                })
                            }
                        }else {
                            this.setState({nameFileDialog: {open: false}})
                        }



                    }} actions={[{key: 'cancel', label: _t('core.cancel')}, {key: 'save', label: _t('core.save'), type: 'primary'}]}
                                  title={_t(nameFileDialog.isFolder?'FilesContainer.createFolder':'FilesContainer.createFile')}>

                        <StyledTextField inputRef={(ref)=>{
                            nameFileDialog.input = ref
                        }} inputProps={{pattern: '[a-zA-Z0-9._-]{1,15}'}} placeholder="Name" required={true}></StyledTextField>

                    </SimpleDialog>
                    <SimpleSelect
                        label="Select aspace"
                        fullWidth={true}
                        value={space}
                        onChange={(e, v) => {
                            this.setState({space:e.target.value})
                            history.push(`${location.origin+location.pathname}?space=${e.target.value}&dir=${this.state.dir}`)
                        }}
                        items={FilesContainer.spaces}
                    />
                    <TextField
                        type="search"
                        helperText={'Search for file content'}
                        disabled={false} fullWidth
                        placeholder="Search"
                        name="searchText"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                this.setState({searchText: e.target.value})
                            }
                        }}/>
                    <TextField
                        type="search"
                        helperText={'Filter'}
                        disabled={false} fullWidth
                        placeholder="Filter"
                        name="filterText"
                        onChange={(e) => {
                            this.setState({filterText: e.target.value})
                        }}/>

                    <Query query={COMMAND_QUERY}
                           fetchPolicy="cache-and-network"
                           variables={{sync: true, command}}>
                        {({loading, error, data}) => {
                            if (loading) {
                                this._loading = true
                                return 'Loading...'
                            }
                            this._loading = false
                            if (error) return `Error! ${error.message}`
                            if (!data.run) return 'No data'

                            const rows = data.run.response.split('\n')
                            let listItems = []
                            if (searchText) {
                                listItems = rows.reduce((a, fileRow) => {
                                    if (fileRow) {
                                        const b = fileRow.split(' ').filter(x => x)
                                        a.push({
                                            icon: <InsertDriveFileIcon />,
                                            selected: false,
                                            primary: fileRow,
                                            onClick: () => {
                                                this.setState({file: fileRow})
                                            }
                                        })
                                    }
                                    return a
                                }, [])
                            } else {
                                rows.shift()
                                listItems = rows.reduce((a, fileRow) => {
                                    if (fileRow) {
                                        const b = fileRow.split(' ').filter(x => x)
                                        const mdate = new Date(b[5])
                                        const fileName = b.splice(6).join(' ')
                                        if(!filterText || fileName.toLowerCase().indexOf(filterText.toLowerCase())>=0) {
                                            a.push({
                                                icon: b[0].indexOf('d') === 0 ? <FolderIcon/> : <InsertDriveFileIcon/>,
                                                selected: false,
                                                primary: fileName,
                                                onClick: () => {
                                                    if (b[0].indexOf('d') === 0) {
                                                        //change dir
                                                        this.setState({
                                                            file: null,
                                                            fileSize: 0,
                                                            dir: dir + '/' + fileName
                                                        })
                                                        history.push(`${location.origin + location.pathname}?space=${this.state.space}&dir=${dir + '/' + fileName}`)
                                                    } else {
                                                        this.setState({file: fileName, fileSize: parseFloat(b[4])})
                                                    }
                                                },
                                                secondary: `${formatBytes(b[4])} - ${Util.formatDate(mdate)}`/*,
                                             actions: <DeleteIconButton onClick={this.handlePostDeleteClick.bind(this, post)}/>,
                                             disabled: ['creating', 'deleting'].indexOf(post.status) > -1*/
                                            })
                                        }
                                    }
                                    return a
                                }, [])

                                if (dir.indexOf('/') >= 0) {
                                    listItems.unshift({
                                        icon: <FolderIcon />,
                                        selected: false,
                                        primary: '..',
                                        onClick: () => {
                                            const newDir = dir.substring(0, dir.lastIndexOf('/'))
                                            this.setState({file:null, dir: newDir})
                                            history.push(`${location.origin+location.pathname}?space=${this.state.space}&dir=${newDir}`)
                                        }
                                    })
                                }
                            }

                            return <div style={{position:'relative'}}><SimpleList items={listItems}
                                               paperProps={{sx:{
                                                   height:'41.5rem', overflow:'auto'
                                               }}}
                                               contextMenu={[
                                                   {
                                                       name: _t('FilesContainer.deleteFile'),
                                                       onClick: (e, payload)=>{
                                                           this.setState({confirmDeletionDialog:{open:true, fileName:payload.primary}})
                                                       },
                                                       icon: 'delete'
                                                   }
                                               ]}
                                               count={listItems.length}/>

                                <SimpleMenu key="menu" mini fab color="secondary" style={{
                                    zIndex: 999,
                                    position: 'absolute',
                                    bottom: '8px',
                                    right: '8px'
                                }} items={[
                                    {
                                        name: _t('FilesContainer.createFile'),
                                        onClick: ()=>{
                                            this.setState({nameFileDialog:{open:true, isFolder:false}})
                                        },
                                        icon: <InsertDriveFileIcon />
                                    },
                                    {
                                        name: _t('FilesContainer.createFolder'),
                                        onClick: ()=>{
                                            this.setState({nameFileDialog:{open:true, isFolder:true}})
                                        },
                                        icon: <FolderIcon />
                                    }
                                ]}/>
                            </div>
                        }}
                    </Query>

                    <FileDrop maxSize={10000000} style={{width: '100%', height: '10rem', marginTop:'2rem'}}
                              accept="*/*"
                              uploadTo="/graphql/upload"
                              data={{keepFileName: true, createMediaEntry: false, uploadDir:space+dir}}
                              resizeImages={false}
                              label="Drop file here"/>

                </Col>
                <Col sm={8}>
                    {fileEditor}
                </Col>
            </Row>
        }

        if (embedded) {
            // without layout
            return content
        } else {
            return <>
                <Typography variant="h3" gutterBottom>Files</Typography>
                {content}
            </>
        }

    }

    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name
        this.setState({
            [target.name]: value
        }, () => {

        })
    }


    fileChange(file, content) {
        clearTimeout(this._fileChange)
        this._fileChange = setTimeout(() => {
            client.query({
                fetchPolicy: 'no-cache',
                query: COMMAND_QUERY,
                variables: {
                    sync: true,
                    command: `printf %s "${Util.escapeDoubleQuotes(content.replace(/\$/g, '\\$').replace(/`/g, '\\`'))}" > "${file}"`
                }

            }).then(response => {
                _app_.dispatcher.addNotification({key: 'fileChange', message: `File "${file}" saved`})
            })
        }, 1500)
    }
}


FilesContainer.propTypes = {
    file: PropTypes.string,
    space: PropTypes.string,
    embedded: PropTypes.bool,
    editOnly: PropTypes.bool
}

export default FilesContainer
