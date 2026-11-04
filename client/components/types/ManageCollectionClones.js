import React from 'react'
import PropTypes from 'prop-types'
import {
    DeleteIconButton,
    DoneIconButton,
    SimpleList,
    SimpleDialog,
    Tooltip
} from 'ui/admin'
import Util from 'client/util/index.mjs'
import {COLLECTIONS_QUERY} from '../../constants/admin.mjs'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {getCurrentTheme} from 'ui/admin'
import {client, Query} from '../../middleware/graphql'
import {_t} from 'util/i18n.mjs'
import {parseCollectionVersion, isLiveVersion, DEFAULT_VERSION} from 'client/util/collectionVersions.mjs'


class ManageCollectionClones extends React.PureComponent {
    state = {
        showConfirmDeletion: false,
        dataToDelete: null,
        // version that is about to go live (confirmation)
        dataToDeploy: null
    }

    handleDeleteClick(item) {
        this.setState({showConfirmDeletion: true, dataToDelete: item})
    }

    handleSelectClick(item) {
        // switches the version for all visitors: ask first
        this.setState({dataToDeploy: item})
    }

    handleConfirmDeploy(action) {
        const item = this.state.dataToDeploy
        this.setState({dataToDeploy: null})
        if (!item || !action || action.key !== 'yes') {
            return
        }
        const {setKeyValueGlobal, keyValueGlobalMap, type} = this.props
        const value = item.name === DEFAULT_VERSION ? DEFAULT_VERSION : parseCollectionVersion(type, item.name).value
        const o = Object.assign({}, keyValueGlobalMap['TypesSelectedVersions'] || {}, {[type]: value})
        setKeyValueGlobal({key: 'TypesSelectedVersions', value: o})
    }

    handleConfirmDeletion(action) {
        if (action && action.key === 'yes') {
            this.deleteData(this.state.dataToDelete)
        }
        this.setState({showConfirmDeletion: false, dataToDelete: false})
    }

    versionLabel(item) {
        if (item.name === DEFAULT_VERSION) {
            return 'Default'
        }
        const {name, value} = parseCollectionVersion(this.props.type, item.name)
        return name || value
    }

    render() {
        const {type, keyValueGlobalMap, loading} = this.props

        if (loading) return null

        const {showConfirmDeletion, dataToDelete, dataToDeploy} = this.state

        return [<Query key="query" query={COLLECTIONS_QUERY}
                       fetchPolicy="cache-first"
                       variables={{filter: '^' + type + '_.*'}}>
            {({loading, error, data}) => {
                if (loading) return 'Loading...'
                if (error) return `Error! ${error.message}`
                if (!data.collections.results) return null

                const versions = keyValueGlobalMap['TypesSelectedVersions'] || {}
                const liveStyle = {backgroundColor: getCurrentTheme().palette.primary.light}

                const listItems = data.collections.results.reduce((a, item) => {
                    const {value, name, timestamp} = parseCollectionVersion(type, item.name)
                    const live = isLiveVersion(versions, type, value)
                    a.push({
                        style: live ? liveStyle : {},
                        selected: false,
                        primary: (name || 'no name') + (live ? ' · ' + _t('ManageCollectionClones.live') : ''),
                        secondary: timestamp ? Util.formattedDatetime(timestamp) : value,
                        // ("Set as default" did exactly the same as "Deploy version" and was removed.)
                        // The live version can not be deleted - the server checks it as well
                        actions: live ? [] : [<Tooltip title={_t('ManageCollectionClones.deploy')} key="select"><DoneIconButton
                            onClick={this.handleSelectClick.bind(this, item)}/></Tooltip>,
                            <DeleteIconButton key="delete" onClick={this.handleDeleteClick.bind(this, item)}/>]
                    })
                    return a
                }, [])

                const defaultLive = isLiveVersion(versions, type, DEFAULT_VERSION)
                listItems.unshift({
                    style: defaultLive ? liveStyle : {},
                    actions: defaultLive ? [] : [<Tooltip title={_t('ManageCollectionClones.deploy')} key="select"><DoneIconButton
                        onClick={this.handleSelectClick.bind(this, {name: DEFAULT_VERSION})}/></Tooltip>],
                    primary: 'Default' + (defaultLive ? ' · ' + _t('ManageCollectionClones.live') : ''),
                    secondary: _t('ManageCollectionClones.canNotBeDeleted')
                })

                return <SimpleList items={listItems}
                                   count={listItems.length}/>
            }}
        </Query>,

            dataToDeploy &&
            <SimpleDialog key="deployDialog" open={true} onClose={this.handleConfirmDeploy.bind(this)}
                          actions={[{key: 'no', label: _t('core.cancel')}, {key: 'yes', label: _t('ManageCollectionClones.deploy'), type: 'primary'}]}
                          title={_t('ManageCollectionClones.deployTitle')}>
                {_t('ManageCollectionClones.deployText', {name: this.versionLabel(dataToDeploy)})}
            </SimpleDialog>,

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
