import React from 'react'
import Hook from '../../util/hook.cjs'
import config from 'gensrc/config-client'
import {registerTrs, _t} from '../../util/i18n.mjs'
import {translations} from './translations/admin'


registerTrs(translations, 'ApiExtension')

export default () => {


    Hook.on('TypeCreateEdit', ({type, props}) => {
        if (type === 'Api') {
            props.actions.unshift({key: 'openApi', label: 'Open API URL'})
            // place before "Cancel" so it groups with the extra actions (better on mobile)
            const cancelIdx = props.actions.findIndex(a => a.key === 'cancel')
            const accessLogAction = {key: 'showAccessLog', label: _t('Api.showAccessLog')}
            if (cancelIdx >= 0) {
                props.actions.splice(cancelIdx, 0, accessLogAction)
            } else {
                props.actions.push(accessLogAction)
            }
        }
    })


    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit}) {
        if (type === 'Api' && action && action.key === 'openApi') {
            const win = window.open(`/${Array.isArray(config.API_PREFIX)?config.API_PREFIX[0]:config.API_PREFIX}/${dataToEdit.slug}`, '_blank')
            win.focus()
        } else if (type === 'Api' && action && action.key === 'showAccessLog' && dataToEdit?._id) {
            // access log entries of this api (written by server.mjs when "accessLog" is enabled)
            const baseFilter = `location==api-access && meta.apiId==${dataToEdit._id}`
            window.open(`${config.ADMIN_BASE_URL}/types/Log?fixType=Log&s=${encodeURIComponent('_id desc')}` +
                `&title=${encodeURIComponent(`API ${dataToEdit.name || dataToEdit.slug}`)}&baseFilter=${encodeURIComponent(baseFilter)}`, '_blank')
        }
    })

}
