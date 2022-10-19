import React from 'react'
import BaseLayout from 'client/components/layout/BaseLayout'
import {
    Typography,
    TextField,
    SimpleList,
    SimpleSelect,
    Row,
    Col,
    FolderIcon,
    InsertDriveFileIcon
} from 'ui/admin'
import Util from 'client/util/index.mjs'
import {COMMAND_QUERY} from '../constants/index.mjs'
import PropTypes from 'prop-types'
import config from 'gen/config-client'
import {Query, client} from '../middleware/graphql'
import FileDrop from '../components/FileDrop'
import Async from '../components/Async'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../components/CodeEditor')}/>

class FilesContainer extends React.Component {

    static spaces = [{value:'./',name:'Application'},
        {value:config.HOSTRULES_ABSPATH,name:'Hostrules'},
        {value:config.WEBROOT_ABSPATH,name:'Webroot'},
        {value:'/etc/lunuc/',name:'Config (etc)'},
        ]
    constructor(props) {
        super(props)

        this.state = {
            file: props.file,
            dir: '',
            searchText: '',
            space: props.space || './'
        }
    }


    formatBytes(bytes, decimals) {
        if (bytes == 0) return '0 Bytes';
        const k = 1024,
            dm = decimals || 2,
            sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
            i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    render() {
        const {embedded, editOnly} = this.props
        const {file, dir, searchText, space} = this.state

        let command = 'ls -l ' + space + dir

        if (searchText) {
            command = `find ${space+dir} -size -1M -type f -name '*.*' ! -path "./node_modules/*" ! -path "./bower_components/*" -exec grep -ril "${searchText}" {} \\;`

        }

        let fileEditor = file &&
            <Query query={COMMAND_QUERY}
                   fetchPolicy="cache-and-network"
                   variables={{sync: true, command: 'less -f -L ' + space+dir + '/' + file}}>
                {({loading, error, data}) => {
                    if (loading) return 'Loading...'
                    if (error) return `Error! ${error.message}`
                    if (!data.run) return 'No data'
                    const ext = file.slice((file.lastIndexOf('.') - 1 >>> 0) + 2)
                    return <CodeEditor lineNumbers controlled onChange={c => {
                        this.fileChange(space+dir + '/' + file, c)
                    }} type={ext || 'text' }>{data.run.response}</CodeEditor>
                }}
            </Query>


        let content

        if (editOnly) {
            content = fileEditor
        } else {
            content = <Row spacing={3}>
                <Col sm={4}>
                    <SimpleSelect
                        label="Select aspace"
                        fullWidth={true}
                        value={space}
                        onChange={(e, v) => {
                            this.setState({space:e.target.value})
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
                                console.log(e)
                                this.setState({searchText: e.target.value})
                            }
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
                                        a.push({
                                            icon: b[0].indexOf('d') === 0 ? <FolderIcon /> :
                                                <InsertDriveFileIcon />,
                                            selected: false,
                                            primary: b[8],
                                            onClick: () => {
                                                if (b[0].indexOf('d') === 0) {
                                                    //change dir
                                                    this.setState({file:null, dir: dir + '/' + b[8]})
                                                } else {
                                                    this.setState({file: b[8]})
                                                }
                                            },
                                            secondary: this.formatBytes(b[4])/*,
                                             actions: <DeleteIconButton onClick={this.handlePostDeleteClick.bind(this, post)}/>,
                                             disabled: ['creating', 'deleting'].indexOf(post.status) > -1*/
                                        })
                                    }
                                    return a
                                }, [])

                                if (dir.indexOf('/') >= 0) {
                                    listItems.unshift({
                                        icon: <FolderIcon />,
                                        selected: false,
                                        primary: '..',
                                        onClick: () => {
                                            this.setState({file:null, dir: dir.substring(0, dir.lastIndexOf('/'))})
                                        }
                                    })
                                }
                            }

                            return <SimpleList items={listItems}
                                               count={listItems.length}/>
                        }}
                    </Query>

                    <FileDrop maxSize={10000000} style={{width: '15rem', height: '10rem'}}
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
            return <BaseLayout key="baseLayout">
                <Typography variant="h3" gutterBottom>Files</Typography>

                {content}
            </BaseLayout>
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
                _app_.dispatcher.addNotification.addNotification({key: 'fileChange', message: `File "${file}" saved`})
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
