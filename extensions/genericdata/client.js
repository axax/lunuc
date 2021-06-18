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

            response.data.genericDatas.results.forEach(item=>{
                item.data = JSON.parse(item.data)
            })
        }
    })

}
