import React from 'react'
import {
    SimpleSelect
} from 'ui/admin'
import Util from 'client/util/index.mjs'
import {COLLECTIONS_QUERY} from '../../constants/index.mjs'
import {Query} from '../../middleware/graphql'
import {_t} from 'util/i18n.mjs'

const SelectCollection = ({type, _version, ignore, onChange}) =>{

    return <Query query={COLLECTIONS_QUERY}
                  fetchPolicy="cache-and-network"
                  variables={{filter: type?`^${type}_.*`:''}}>
        {({loading, error, data}) => {
            if (loading) return 'Loading...'
            if (error) return `Error! ${error.message}`

            if (!data.collections.results) return null

            const items = data.collections.results.reduce((a, c) => {
                const value = c.name.substring(c.name.indexOf('_') + 1)
                if(ignore && ignore.indexOf(value) >=0){
                    return
                }
                let date, name = 'no name'

                if (value.indexOf('_') >= 0) {
                    date = value.substring(0, value.indexOf('_'))
                    name = value.substring(value.indexOf('_') + 1).replace('_', ' ')
                } else {
                    date = value
                }

                a.push({
                    value,
                    name: Util.formattedDatetime(date) + (name ? ' - ' + name : '')
                })
                return a
            }, [])
            if(!ignore || ignore.indexOf('default') <0) {
                items.unshift({value: 'default', name: 'Default'})
            }


            return <SimpleSelect
                label={_t('TypesContainer.selectVersion')}
                value={_version}
                onChange={onChange}
                items={items}
            />
        }}
    </Query>
}

export default SelectCollection
