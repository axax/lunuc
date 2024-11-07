import React from 'react'
import Hook from '../../util/hook.cjs'
import config from 'gensrc/config-client'
import {registerTrs} from '../../util/i18n.mjs'
import {translations} from './translations/admin'


registerTrs(translations, 'ApiExtension')

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
