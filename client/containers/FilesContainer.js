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

                <Query query={gql`query collections($filter:String){collections(filter:$filter){results{name}}}`}
                       fetchPolicy="cache-and-network"
                       variables={{filter: '^' + type + '_.*'}}>
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`

                        if (!data.collections.results) return null

                        const items = data.collections.results.reduce((a, c) => {
                            const value = c.name.substring(c.name.indexOf('_') + 1)
                            a.push({value, name: value})
                            return a
                        }, [])
                        items.unshift({value: 'default', name: 'Default'})
                        return <SimpleSelect
                            label="Current version"
                            value={version}
                            onChange={(e) => {

                                const {type, page, limit, sort, filter} = this.pageParams
                                this.goTo(type, page, limit, sort, filter, e.target.value)

                                //this.setState({selectedVersion:e.target.value})
                            }}
                            items={items}
                        />
                    }}
                </Query>

            </BaseLayout>
        )
    }
}


FilesContainer.propTypes = {
}

export default FilesContainer