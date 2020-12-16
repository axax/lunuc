import React from 'react'
import Hook from 'util/hook'


export default () => {

    Hook.on('CmsViewContainerSubscription',  ({subscription, storedData, resolvedDataJson}) => {
        if (subscription.type === 'GenericData' && subscription.autoUpdate) {
            resolvedDataJson[subscription.autoUpdate].results.forEach(item=>{
                if(item.data && item.data.constructor !== Object){
                    item.data = JSON.parse(item.data)
                }
            })
        }
    })

}
