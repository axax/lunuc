import React, {useContext} from 'react'
import PropTypes from 'prop-types'
import {SimpleDialog, Snackbar} from 'ui/admin'
import {_t} from 'util/i18n.mjs'
import {AppContext} from '../AppContext'

class ErrorHandler extends React.Component {

    handleDialogClose(key) {
        _app_.dispatcher.dispatch({type:'MESSAGE',payload:{remove:key}})
    }

    componentWillUnmount() {
        _app_.dispatcher.dispatch({type:'MESSAGE',payload:{removeAll:true}})
    }

    render() {
        const {snackbar} = this.props

        const globalContext = useContext(AppContext)

        const messages = globalContext.state.messages
        if (!messages || !Object.keys(messages).length)
            return null
        const key = Object.keys(messages)[0], msg = messages[key].msg

        if( snackbar ){
            return <Snackbar
                open={true}
                onClose={this.handleDialogClose.bind(this, key)}
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
        return <SimpleDialog open={true} onClose={this.handleDialogClose.bind(this, key)}
                             actions={[{autoFocus: true, key: 'ok', label: 'Ok', type: 'primary'}]} title={_t('ErrorHandler.title')}>
            {msg}
        </SimpleDialog>

    }
}


ErrorHandler.propTypes = {
    snackbar: PropTypes.bool
}

export default ErrorHandler

