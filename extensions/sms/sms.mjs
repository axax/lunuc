import Util from '../../api/util/index.mjs'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'

const DEFAULT_ORIGINATOR = 'lunuc'
const REQUEST_TIMEOUT = 30000

export const sendSms = async ({db, req, sender, recipient, domain, content}) => {

    if (!content) {
        throw new Error('Sms content must not be empty.')
    }
    if (!recipient) {
        throw new Error('Please provide a SMS recipient.')
    }

    const values = await Util.keyValueGlobalMap(db, req.context, ['SMSServiceProviderSettings'])

    const smsProviderSettings = values.SMSServiceProviderSettings
    if (!smsProviderSettings || !smsProviderSettings.url) {
        throw new Error('Please add SMSServiceProviderSettings as a global value with the sms service provider details (d7networks.com) - expected shape: {url, headers}')
    }

    const originator = sender || DEFAULT_ORIGINATOR

    // d7networks Messages API v1 payload format
    const payload = {
        messages: [
            {
                channel: 'sms',
                recipients: [recipient],
                content,
                msg_type: 'text',
                data_coding: 'text'
            }
        ],
        message_globals: {
            originator
        }
    }

    const createLogEntry = async (response) => {
        // logging must not break sms sending
        try {
            return await GenericResolver.createEntity(db, req, 'SmsLog', {
                domain: domain || DEFAULT_ORIGINATOR,
                sender: originator,
                content,
                recipient,
                response
            })
        } catch (logError) {
            console.error('sendSms: failed to create SmsLog entry', logError)
        }
    }

    let result
    let errorInfo

    try {
        const response = await fetch(smsProviderSettings.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...smsProviderSettings.headers
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(smsProviderSettings.timeout || REQUEST_TIMEOUT)
        })

        const responseText = await response.text()

        try {
            result = JSON.parse(responseText)
        } catch (e) {
            result = {raw: responseText}
        }

        if (!response.ok) {
            errorInfo = {message: `Sms provider returned status ${response.status}`, status: response.status, response: result}
        }

    } catch (error) {
        // network errors, timeout etc.
        errorInfo = {
            message: error.message,
            code: error.code || (error.cause && error.cause.code)
        }
    }

    if (errorInfo) {
        await createLogEntry(errorInfo)
        const error = new Error(errorInfo.message)
        Object.assign(error, errorInfo)
        throw error
    }

    await createLogEntry(result)
    return result
}

export default sendSms