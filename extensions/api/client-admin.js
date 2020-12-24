import React from 'react'
import Hook from "../../util/hook";
import config from 'gensrc/config-client'

export default () => {


    Hook.on('TypeCreateEdit', ({type, props}) => {
        if (type === 'Api') {
            props.actions.unshift({key: 'openApi', label: 'Open API URL'})
        }
    })


    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit}) {
        if (type === 'Api' && action && action.key === 'openApi') {
            const win = window.open(`/${config.API_PREFIX}/${dataToEdit.slug}`, '_blank')
            win.focus()
        }
    })

}
