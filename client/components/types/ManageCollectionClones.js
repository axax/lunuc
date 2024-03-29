import React from 'react'
import PropTypes from 'prop-types'
import {
    DeleteIconButton,
    BackupIconButton,
    DoneIconButton,
    SimpleList,
    SimpleDialog,
    Tooltip
} from 'ui/admin'
import Util from 'client/util/index.mjs'
import {COLLECTIONS_QUERY} from '../../constants/index.mjs'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {theme} from 'ui/admin'
import {client, Query} from '../../middleware/graphql'
import {_t} from 'util/i18n.mjs'

class ManageCollectionClones extends React.PureComponent {

    state = {
        showConfirmDeletion: false,
        dataToDelete: null,
        setAsDefault: null
    }

    handleDeleteClick(item) {
        this.setState({showConfirmDeletion: true, dataToDelete: item})
    }

    handleSelectClick(item) {
        const {setKeyValueGlobal, keyValueGlobalMap, type} = this.props

        const o = Object.assign({}, keyValueGlobalMap['TypesSelectedVersions'] || {}, {[type]: item.name.substring(item.name.indexOf('_') + 1)})


        setKeyValueGlobal({key: 'TypesSelectedVersions', value: o})
    }

    handleConfirmDeletion(action) {
        if (action && action.key === 'yes') {
            this.deleteData(this.state.dataToDelete)
        }
        this.setState({showConfirmDeletion: false, dataToDelete: false})
    }

    render() {
        const {type, keyValueGlobalMap, loading} = this.props
        if (loading) return null

        const {showConfirmDeletion, dataToDelete} = this.state
        return [<Query key="query" query={COLLECTIONS_QUERY}
                       fetchPolicy="cache-first"
                       variables={{filter: '^' + type + '_.*'}}>
            {({loading, error, data}) => {
                if (loading) return 'Loading...'
                if (error) return `Error! ${error.message}`
                if (!data.collections.results) return null

                const versions = keyValueGlobalMap['TypesSelectedVersions'] || {}

                const listItems = data.collections.results.reduce((a, item) => {
                    const value = item.name.substring(item.name.indexOf('_') + 1)
                    let date, name = 'no name'

                    if (value.indexOf('_') >= 0) {
                        date = value.substring(0, value.indexOf('_'))
                        name = value.substring(value.indexOf('_') + 1).replace('_', ' ')
                    } else {
                        date = value
                    }

                    a.push({
                        style: versions[type] === value ? {backgroundColor: theme.palette.primary.light} : {},
                        selected: false,
                        primary: name,
                        secondary: Util.formattedDatetime(date),
                        actions: [<Tooltip title="Deploy version" key="select"><DoneIconButton
                            onClick={this.handleSelectClick.bind(this, item)}/></Tooltip>,
                            <Tooltip title="Set as default" key="setdefault"><BackupIconButton
                            onClick={this.handleSelectClick.bind(this, item)}/></Tooltip>,
                            <DeleteIconButton key="delete" onClick={this.handleDeleteClick.bind(this, item)}/>],
                    })
                    return a
                }, [])

                listItems.unshift({
                    style: !versions || !versions[type] || versions[type] === 'default' ? {backgroundColor: theme.palette.primary.light} : {},
                    actions: <Tooltip title="Set collection as active" key="select"><DoneIconButton
                        onClick={this.handleSelectClick.bind(this, {name: "default"})}/></Tooltip>,
                    primary: 'Default',
                    secondary: _t('ManageCollectionClones.canNotBeDeleted')
                })


                return <SimpleList items={listItems}
                                   count={listItems.length}/>
            }}
        </Query>,

            dataToDelete &&
            <SimpleDialog key="deleteDialog" open={showConfirmDeletion} onClose={this.handleConfirmDeletion.bind(this)}
                          actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                          title={_t('TypesContainer.deleteConfirmTitle')}>
                {_t('ManageCollectionClones.areYouSureToDelete')}
            </SimpleDialog>]
    }


    deleteData({name}) {
        const {type} = this.props

        if (name) {

            client.mutate({
                mutation: `mutation deleteCollection($name:String!){deleteCollection(name:$name){status}}`,
                variables: {
                    name
                },
                update: (store, {data}) => {
                    const variables = {filter: '^' + type + '_.*'}
                    const storeData = store.readQuery({
                        query: COLLECTIONS_QUERY,
                        variables
                    })

                    const newData = {...storeData.collections}

                    newData.results = storeData.collections.results.filter(f => f.name != name)

                    store.writeQuery({
                        query: COLLECTIONS_QUERY,
                        variables,
                        data: {...storeData, collections: newData}
                    })
                },
            })
        }
    }

}


ManageCollectionClones.propTypes = {
    type: PropTypes.string.isRequired,
    keyValueGlobalMap: PropTypes.object,
    setKeyValueGlobal: PropTypes.func
}

export default withKeyValues(ManageCollectionClones, false, ['TypesSelectedVersions'])
