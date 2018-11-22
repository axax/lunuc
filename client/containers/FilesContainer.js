import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
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
import {Query} from 'react-apollo'

const {BACKUP_URL} = config


class FilesContainer extends React.Component {


    constructor(props) {
        super(props)

        this.state = {}
    }

    render() {
        return (
            <BaseLayout>
                <Typography variant="h3" gutterBottom>Files</Typography>

                <Query query={gql`query run($command:String!){run(command:$command){response}}`}
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
                                    selected: false,
                                    primary: b[8],
                                    onClick: () => {
                                        // this.goTo(post._id, posts.page, posts.limit, this.filter)
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

            </BaseLayout>
        )
    }
}


FilesContainer.propTypes = {}

export default FilesContainer