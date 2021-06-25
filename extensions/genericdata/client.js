import React from 'react'
import Hook from 'util/hook'


export default () => {

    Hook.on('CmsViewContainerSubscription', ({subscription, storedData, resolvedDataJson}) => {
        if (subscription.type === 'GenericData' && subscription.autoUpdate) {
            resolvedDataJson[subscription.autoUpdate].results.forEach(item => {
                if (item.data && item.data.constructor !== Object) {
                    item.data = JSON.parse(item.data)
                }
            })
        }
    })


    // add some extra data to the table
    Hook.on('ApiClientQueryResponse', ({response}) => {

        if (response && response.data && response.data.genericDatas && response.data.genericDatas.results) {

            const data = response.data.genericDatas

            let definition
            if( data.meta ){
                definition = JSON.parse(data.meta)
            }

            data.results.forEach(item=>{
                item.data = JSON.parse(item.data)

                if( item.definition ){
                    item.definition.structure = JSON.parse(item.definition.structure)
                }else if( definition ){
                    // take definition from meta as all items have the same
                    item.definition = definition
                }
            })
        }
    })

}
