import React from 'react'
import Hook from 'util/hook'


export default () => {


    Hook.on('CmsViewContainerSubscription',  ({type, storedData, resolvedDataJson}) => {
        if (type === 'GenericData') {

            resolvedDataJson.GenericData.results.forEach(item=>{
                if(item.data && item.data.constructor !== Object){
                    item.data = JSON.parse(item.data)
                }
            })
        }
    })

}
