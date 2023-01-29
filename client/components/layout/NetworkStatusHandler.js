import React from 'react'
import {LinearProgress} from 'ui/admin'
import {useContext} from 'react'
import {AppContext} from '../../components/AppContext'

// loading indicator is shown if api requests take more than 500 ms
const LOADER_DELAY = 900

class NetworkStatusHandler extends React.Component {
    delayTimer = null

    constructor(props) {
        super(props)
    }

    componentWillUnmount() {
        clearTimeout(this.delayTimer)
        this.delayTimer = null
    }

    render() {
        const globalContext = useContext(AppContext)

        if (!globalContext.state.networkStatus.loading){
            this.showLoader = false
            return null
        }

        if(!this.showLoader){
            clearTimeout(this.delayTimer)
            this.delayTimer = setTimeout(()=>{
                this.showLoader = true
                this.forceUpdate()
            },LOADER_DELAY)

            return null
        }

        console.log('render NetworkStatusHandler')
        return <div
            style={{height: '10px', position: 'fixed', bottom: '0px', left: '0px', width: '100%', zIndex: 9999}}>
            <LinearProgress style={{height: '10px'}} variant="query" color="secondary"/>
        </div>
    }
}

export default NetworkStatusHandler
