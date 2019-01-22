import React from 'react'
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
import ContentEditable from '../components/generic/ContentEditable'
import {Query, withApollo} from 'react-apollo'
import {COMMAND_QUERY} from '../constants'
import PropTypes from 'prop-types'
import ApolloClient from 'apollo-client'


class FilesContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            file: false,
            dir: '.'
        }
    }

    render() {
        const {file, dir} = this.state
        return (
            <BaseLayout>
                <Typography variant="h3" gutterBottom>Files</Typography>

                <Row spacing={24}>
                    <Col sm={4}>
                        <Query query={gql(COMMAND_QUERY)}
                               fetchPolicy="cache-and-network"
                               variables={{command: 'ls -l ' + dir}}>
                            {({loading, error, data}) => {
                                if (loading) return 'Loading...'
                                if (error) return `Error! ${error.message}`
                                if (!data.run) return `No data`

                                const rows = data.run.response.split('\n')
                                rows.shift()

                                const listItems = rows.reduce((a, fileRow) => {
                                    if (fileRow) {
                                        const b = fileRow.split(' ').filter(x => x);
                                        a.push({
                                            icon: b[0].indexOf('d') === 0 ? <FolderIcon /> : <InsertDriveFileIcon />,
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

                                return <SimpleList items={listItems}
                                                   count={listItems.length}/>
                            }}
                        </Query>

                    </Col>
                    <Col sm={8}>
                        {file &&
                        <Query query={gql(COMMAND_QUERY)}
                               fetchPolicy="cache-and-network"
                               variables={{command: 'less ' + dir + '/' + file}}>
                            {({loading, error, data}) => {
                                if (loading) return 'Loading...'
                                if (error) return `Error! ${error.message}`
                                if (!data.run) return `No data`
                                const ext = file.slice((file.lastIndexOf(".") - 1 >>> 0) + 2)
                                return <ContentEditable onChange={c => {
                                    this.fileChange(dir + '/'+file, c)
                                }} highlight={ext} setHtml={false} children={data.run.response}/>
                            }}
                        </Query>
                        }
                    </Col>
                </Row>
            </BaseLayout>
        )
    }

    fileChange(file, content) {

        this.props.client.query({
            fetchPolicy: 'no-cache',
            query: gql(COMMAND_QUERY),
            variables: {command: 'less ' + file}

        }).then(response => {
            console.log(response)

        })

        console.log(file, content)
    }
}


FilesContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
}

export default withApollo(FilesContainer)