import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {gql} from '@apollo/client'
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
import Util from 'client/util'
import CodeEditor from 'client/components/CodeEditor'
import {withApollo} from '@apollo/react-hoc'
import {Query} from '@apollo/react-components'
import {COMMAND_QUERY} from '../constants'
import PropTypes from 'prop-types'
import {ApolloClient} from '@apollo/client'
import * as NotificationAction from 'client/actions/NotificationAction'
import config from 'gen/config'

class FilesContainer extends React.Component {

    static spaces = [{value:'./',name:'Application'},
        {value:config.HOSTRULES_ABSPATH,name:'Hostrules'},
        {value:config.WEBROOT_ABSPATH,name:'Webroot'}
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
            <Query query={gql(COMMAND_QUERY)}
                   fetchPolicy="cache-and-network"
                   variables={{sync: true, command: 'less -f -L ' + space+dir + '/' + file}}>
                {({loading, error, data}) => {
                    if (loading) return 'Loading...'
                    if (error) return `Error! ${error.message}`
                    if (!data.run) return 'No data'
                    const ext = file.slice((file.lastIndexOf('.') - 1 >>> 0) + 2)

                    return <CodeEditor lineNumbers onChange={c => {
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

                    <Query query={gql(COMMAND_QUERY)}
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
            return <BaseLayout>
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
            this.props.client.query({
                fetchPolicy: 'no-cache',
                query: gql(COMMAND_QUERY),
                variables: {
                    sync: true,
                    command: `printf %s "${Util.escapeDoubleQuotes(content.replace(/\$/g, '\\$').replace(/`/g, '\\`'))}" > "${file}"`
                }

            }).then(response => {
                this.props.notificationAction.addNotification({key: 'fileChange', message: `File "${file}" saved`})
            })
        }, 1500)
    }
}


FilesContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    notificationAction: PropTypes.object.isRequired,
    file: PropTypes.string,
    space: PropTypes.string,
    embedded: PropTypes.bool,
    editOnly: PropTypes.bool
}


/**
 * Map the state to props.
 */
const mapStateToProps = () => {
    return {}
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    notificationAction: bindActionCreators(NotificationAction, dispatch)
})

/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withApollo(FilesContainer))
