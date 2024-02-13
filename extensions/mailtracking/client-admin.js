import {registerTrs} from 'util/i18n.mjs'
import {translations} from './translations/translations'
import Hook from '../../util/hook.cjs'
import React from "react";
import {client} from "../../client/middleware/graphql";

registerTrs(translations, 'MailTrackingTranslations')


export default () => {




    Hook.on('TypeCreateEdit', function ({type, props, dataToEdit, meta}) {
        if (type === 'MailTracking') {
            if (dataToEdit && dataToEdit._id) {
                props.actions.unshift({key: 'sendMailAgain', label: 'E-Mail nochmals senden'})
            }
        }
    })

    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, meta}) {
        if (type === 'MailTracking' && action && dataToEdit) {
            if(action.key === 'sendMailAgain') {

                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    variables: {ids: [dataToEdit._id]},
                    query: 'query resendMail($ids:[ID]){resendMail(ids:$ids){response}}'
                }).then(response => {
                    if (response.data && response.data.resendMail) {
                        if (meta && meta.TypeContainer) {
                            meta.TypeContainer.setState({simpleDialog: {children: response.data.resendMail.response}})
                        }
                    }
                })
            }
        }
    })

}