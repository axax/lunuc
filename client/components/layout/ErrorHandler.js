import React, {useContext} from 'react'
import {SimpleDialog, Snackbar} from 'ui/admin'
import {_t} from 'util/i18n.mjs'
import {AppContext} from '../AppContext'


function handleDialogClose(key) {
    _app_.dispatcher.dispatch({type:'MESSAGE',payload:{remove:key}})
}


function ErrorHandler({snackbar}) {

    const globalContext = useContext(AppContext)

    const messages = globalContext.state.messages
    if (!messages || !Object.keys(messages).length)
        return null
    const key = Object.keys(messages)[0], msg = messages[key].msg

    if( snackbar ){
        return <Snackbar
            open={true}
            onClose={()=>{
                handleDialogClose(key)
            }}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
            }}
            autoHideDuration={5000}
            message={msg}
        />
    }

    if(msg.indexOf('user aborted a request')>=0){
        return null
    }
    return <SimpleDialog open={true} onClose={()=>{
            handleDialogClose(key)
        }}
        actions={[{autoFocus: true, key: 'ok', label: 'Ok', type: 'primary'}]} title={_t('ErrorHandler.title')}>
        {msg}
    </SimpleDialog>
}

export default ErrorHandler

