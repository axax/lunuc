import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
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
    Col,
    FolderIcon,
    InsertDriveFileIcon
} from 'ui/admin'
import Util from 'client/util'
import CodeEditor from 'client/components/CodeEditor'
import {Query, withApollo} from 'react-apollo'
import {COMMAND_QUERY} from '../constants'
import PropTypes from 'prop-types'
import ApolloClient from 'apollo-client'
import * as NotificationAction from 'client/actions/NotificationAction'

class FilesContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            file: false,
            dir: '.',
            searchText: ''
        }
    }

    render() {
        const {file, dir, searchText} = this.state

        let command = 'ls -l ' + dir

        if (searchText) {
            command = `find ${dir} -size -1M -type f -name '*.*' ! -path "./node_modules/*" ! -path "./bower_components/*" -exec grep -ril "${searchText}" {} \\;`

        }


        return (
            <BaseLayout>
                <Typography variant="h3" gutterBottom>Files</Typography>

                <Row spacing={24}>
                    <Col sm={4}>
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
                               variables={{command}}>
                            {({loading, error, data}) => {
                                if (loading) {
                                    this._loading = true
                                    return 'Loading...'
                                }

                                this._loading = false
                                if (error) return `Error! ${error.message}`
                                if (!data.run) return `No data`

                                const rows = data.run.response.split('\n')
                                let listItems = []
                                if (searchText) {
                                    listItems = rows.reduce((a, fileRow) => {
                                        if (fileRow) {
                                            const b = fileRow.split(' ').filter(x => x);
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
                                            const b = fileRow.split(' ').filter(x => x);
                                            a.push({
                                                icon: b[0].indexOf('d') === 0 ? <FolderIcon /> :
                                                    <InsertDriveFileIcon />,
                                                selected: false,
                                                primary: b[8],
                                                onClick: () => {
                                                    if (b[0].indexOf('d') === 0) {
                                                        //change dir
                                                        this.setState({dir: dir + '/' + b[8]})
                                                    } else {
                                                        this.setState({file: b[8]})
                                                    }
                                                },
                                                secondary: Util.formatBytes(b[4])/*,
                                                 actions: <DeleteIconButton onClick={this.handlePostDeleteClick.bind(this, post)}/>,
                                                 disabled: ['creating', 'deleting'].indexOf(post.status) > -1*/
                                            })
                                        }
                                        return a
                                    }, [])

                                    if (dir.indexOf('/') > 0) {
                                        listItems.unshift({
                                            icon: <FolderIcon />,
                                            selected: false,
                                            primary: '..',
                                            onClick: () => {
                                                this.setState({dir: dir.substring(0, dir.lastIndexOf('/'))})
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
                        {file &&
                        <Query query={gql(COMMAND_QUERY)}
                               fetchPolicy="cache-and-network"
                               variables={{command: 'less -f -L ' + dir + '/' + file}}>
                            {({loading, error, data}) => {
                                if (loading) return 'Loading...'
                                if (error) return `Error! ${error.message}`
                                if (!data.run) return `No data`
                                const ext = file.slice((file.lastIndexOf(".") - 1 >>> 0) + 2)

                                return <CodeEditor lineNumbers onChange={c => {
                                    this.fileChange(dir + '/' + file, c)
                                }} type={ext || 'text' } children={data.run.response}/>
                            }}
                        </Query>
                        }
                    </Col>
                </Row>
            </BaseLayout>
        )
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
                variables: {command: `printf %s "${Util.escapeDoubleQuotes(content.replace(/\$/g, '\\$').replace(/`/g, '\\`'))}" > "${file}"`}

            }).then(response => {
                this.props.notificationAction.addNotification({key: 'fileChange', message: `File "${file}" saved`})
            })
        }, 1500)
    }
}


FilesContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    notificationAction: PropTypes.object.isRequired
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
