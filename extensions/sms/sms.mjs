import Util from '../../api/util/index.mjs'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import request from '../../api/util/request.mjs'

export const sendSms = async ({db, req, sender, recipient, domain, content}) => {

    if(!content){
        throw new Error('Sms content must not be empty.')
    }
    if(!recipient){
        throw new Error('Please provide a SMS recipient.')
    }

    const values = await Util.keyValueGlobalMap(db, req.context, ['SMSServiceProviderSettings'])

    const smsProviderSettings = values.SMSServiceProviderSettings
    if (!smsProviderSettings) {
        throw new Error('Please add SMSServiceProviderSettings as a global value with the sms service provider details (d7networks.com)')
    }

    const data = JSON.stringify({
        globals: {
            originator: "d7sms"
        },
        messages: [
            {
                originator: sender || 'lunuc',
                content: content,
                recipients: [
                    recipient,
                ]
            }
        ]
    })

    const config = {
        ...smsProviderSettings,
        json: true,
        body : data
    }

    return new Promise(async (resolve, reject) => {
        request(config).then( (response) => {
            GenericResolver.createEntity(db, req, 'SmsLog', {
                domain: domain || 'lunuc',
                sender: sender || 'lunuc',
                content,
                recipient,
                response: JSON.stringify(response.data)
            })
            resolve(response)
        }).catch((error) => {
            GenericResolver.createEntity(db, req, 'SmsLog', {
                domain: domain || 'lunuc',
                sender,
                content,
                recipient,
                response: JSON.stringify(error)
            })
            reject(error)
        })
    })


}
