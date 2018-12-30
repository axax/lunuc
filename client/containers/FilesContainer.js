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
    FolderIcon
} from 'ui/admin'
import Util from 'client/util'
import ContentEditable from '../components/generic/ContentEditable'
import {Query} from 'react-apollo'
import {COMMAND_QUERY} from '../constants'



class FilesContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            file: false
        }
    }

    render() {
        const {file} = this.state
        return (
            <BaseLayout>
                <Typography variant="h3" gutterBottom>Files</Typography>

                <Row spacing={24}>
                    <Col md={4}>
                        <Query query={gql(COMMAND_QUERY)}
                               fetchPolicy="cache-and-network"
                               variables={{command: 'ls -l'}}>
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
                                            icon: b[0].indexOf('d')===0?<FolderIcon />:false,
                                            selected: false,
                                            primary: b[8],
                                            onClick: () => {
                                                this.setState({file:b[8]})
                                            },
                                            secondary: Util.formatBytes(b[4])/*,
                                             actions: <DeleteIconButton onClick={this.handlePostDeleteClick.bind(this, post)}/>,
                                             disabled: ['creating', 'deleting'].indexOf(post.status) > -1*/
                                        })
                                    }
                                    return a
                                }, [])

                                return <SimpleList items={listItems}
                                                   count={listItems.length}/>
                            }}
                        </Query>

                    </Col>
                    <Col md={8}>
                        {file &&
                        <Query query={gql(COMMAND_QUERY)}
                               fetchPolicy="cache-and-network"
                               variables={{command: 'less '+file}}>
                            {({loading, error, data}) => {
                                if (loading) return 'Loading...'
                                if (error) return `Error! ${error.message}`
                                if (!data.run) return `No data`

                                return <ContentEditable setHtml={false} children={data.run.response}/>
                            }}
                        </Query>
                        }
                    </Col>
                </Row>
            </BaseLayout>
        )
    }
}


FilesContainer.propTypes = {}

export default FilesContainer