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

        this.state = {
        }
    }

    render() {
        return (
            <BaseLayout>
                <Typography variant="display2" gutterBottom>Files</Typography>

                <Query query={gql`query run($command:String!){run(command:$command){response}}`}
                       fetchPolicy="cache-and-network"
                       variables={{command: 'ls'}}>
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`

                        return data.run.response
                    }}
                </Query>

            </BaseLayout>
        )
    }
}


FilesContainer.propTypes = {
}

export default FilesContainer