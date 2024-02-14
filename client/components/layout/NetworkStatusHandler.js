import React, {useEffect, useState} from 'react'
import {LinearProgress} from 'ui/admin'
import {useContext} from 'react'
import {AppContext} from '../../components/AppContext'

// loading indicator is shown if api requests take more than 500 ms
const LOADER_DELAY = 900

function NetworkStatusHandler() {
    const globalContext = useContext(AppContext)
    const [showLoader, setShowLoader] = useState(false)

    useEffect(() => {
        if(globalContext.state.networkStatus.loading) {
            setTimeout(() => {
                setShowLoader(globalContext.state.networkStatus.loading)
            }, LOADER_DELAY)
        }else{
            setShowLoader(false)
        }
    })

    if (!showLoader){
        // not loading do nothing
        return null
    }

    //console.log('render NetworkStatusHandler')

    return <div
        style={{height: '10px', position: 'fixed', bottom: '0px', left: '0px', width: '100%', zIndex: 9999}}>
        <LinearProgress style={{height: '10px'}} variant="query" color="secondary"/>
    </div>
}

export default NetworkStatusHandler
