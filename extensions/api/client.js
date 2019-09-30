import React from 'react'
import Hook from "../../util/hook";
import config from 'gensrc/config'

export default () => {


    Hook.on('TypeCreateEditDialog', ({type, props}) => {
        if (type === 'Api') {
            props.actions.unshift({key: 'openApi', label: 'Open API URL'})
        }
    })


    Hook.on('TypeCreateEditDialogAction', function ({type, action}) {
        if (type === 'Api' && action && action.key === 'openApi') {
            const win = window.open(`/${config.API_PREFIX}/${this.state.dataToEdit.slug}`, '_blank')
            win.focus()
        }
    })

}
