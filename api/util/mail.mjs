import Util from './index.mjs'
import Hook from '../../util/hook.cjs'
import nodemailer from 'nodemailer'
import {replacePlaceholders} from '../../util/placeholders.mjs'
import nodemailerDirectTransport from 'nodemailer-direct-transport'
import {isString} from '../../client/util/json.mjs'
import {CAPABILITY_ADMIN_OPTIONS} from '../../util/capabilities.mjs'

// nodemailer reads `path` (local file or url) and `href` of attachments itself. Public forms pass
// attachments that come from the browser -> without a check anybody could get server files
// (e.g. /etc/...) or internal urls mailed to them. Allowed for everybody: content and data: uris.
const isDataUri = (value) => isString(value) && /^data:/i.test(value.trim())
const isUnsafeSource = (part) => !!part && typeof part === 'object' &&
    ((part.path !== undefined && !isDataUri(part.path)) || part.href !== undefined)

/**
 * removes attachments with a file path / url, unless the caller is trusted (server code that built
 * the paths itself: trustedAttachments=true) or the user has admin_options
 */
export const sanitizeAttachments = async (db, context, attachments, trusted) => {
    if (!attachments) {
        return attachments
    }
    const list = Array.isArray(attachments) ? attachments : [attachments]
    // performance: capability only checked if there is something to check
    if (trusted || !list.some(isUnsafeSource)) {
        return list
    }
    if (context && context.id && await Util.userHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)) {
        return list
    }
    return list.filter(attachment => {
        if (isUnsafeSource(attachment)) {
            console.warn('sendMail: attachment with path/href removed (not allowed for this user)', attachment && attachment.filename)
            return false
        }
        return true
    })
}





/*
 A very basic implementation for sending emails
 it uses the mail settings from the global key value store
 */

export const sendMail = async (db, context, {settings, recipient, cc, from, fromName, replyTo, subject, body, html, text, slug, headerList, headers, attachments, trustedAttachments, req}) => {

    // recipient (and cc) can be a single address or a list separated by comma / semicolon
    const toAddressList = (value) => (Array.isArray(value) ? value : String(value || '').split(/[,;]/))
        .map(address => String(address).trim()).filter(Boolean)

    const recipients = toAddressList(recipient)
    if (recipients.length === 0 || !recipients.every(address => Util.validateEmail(address))) {
        return {error: `Recipient ${recipient} is not valid`}
    }

    attachments = await sanitizeAttachments(db, context, attachments, trustedAttachments)
    // html/text can also be {path}/{href} objects in nodemailer -> only strings from here on
    if (html && !isString(html)) html = undefined
    if (text && !isString(text)) text = undefined

    const ccRecipients = toAddressList(cc)
    if (!ccRecipients.every(address => Util.validateEmail(address))) {
        return {error: `Cc ${cc} is not valid`}
    }

    let mailSettings
    if (settings) {
        if(settings.extendDefault){
            const values = await Util.keyValueGlobalMap(db, context, ['MailSettings'])
            mailSettings = Object.assign({},values.MailSettings,settings)
        }else {
            mailSettings = settings
        }
    } else {
        const values = await Util.keyValueGlobalMap(db, context, ['MailSettings'])

        mailSettings = values.MailSettings
        if (!mailSettings) {
            throw new Error('Mail settings are missing. Please add MailSettings as a global value')
        }
    }

    let finalHtml
    if (slug && 'undefined' != typeof (Hook.hooks['cmsTemplateRenderer']) && Hook.hooks['cmsTemplateRenderer'].length) {

        if(html && !context.html){
            // pass it as context to the template
            context.html = html
        }

        try {
            finalHtml = await Hook.hooks['cmsTemplateRenderer'][0].callback({
                context,
                db,
                recipient,
                subject,
                body,
                slug,
                req
            })
        }catch (e){
            console.error(`sendMail: rendering template "${slug}" failed: ${e.message}`)
            return {error: e.message}
        }

        finalHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${subject}</title>
</head>
<body>
${finalHtml}
  </body>
</html>    
`


    } else if (html) {
        finalHtml = html
    } else if (body && body.html) {
        finalHtml = replacePlaceholders(body.html, body)
    } else if (body) {
        finalHtml = body
    }

    let fromFinal = from || mailSettings.from

    if (fromName && !fromFinal.endsWith('>')) {
        fromFinal = `${fromName} <${fromFinal}>`
    }

    let replyToFinal = replyTo

    if(!replyToFinal && settings && settings.replyTo){
        replyToFinal = replacePlaceholders(settings.replyTo, body)
    }
    if(!replyToFinal && mailSettings && mailSettings.replyTo){
        replyToFinal = mailSettings.replyTo
    }

    // body/template may result in an object ({path} would be read by nodemailer) -> strings only
    if (finalHtml && !isString(finalHtml)) {
        finalHtml = ''
    }
    let finalText = isString(text)?text.trim():''
    if(!finalText){
        finalText = finalHtml.replace(/<(script|style)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>|<[^>]+>/gi, '').trim()
    }else{
        finalText = replacePlaceholders(finalText, body)
    }

    const message = {
        replyTo: replyToFinal,
        from: fromFinal,
        to: recipients.join(', '),
        cc: ccRecipients.length ? ccRecipients.join(', ') : undefined,
        subject: subject,
        text: finalText, //'Plaintext version of the message'
        html: finalHtml,
        attachments,
        headers,
        list: headerList
    }

    let mailResponse

    let currentMailSettings = mailSettings
    while (true) {
        if (currentMailSettings.useSecond && currentMailSettings.second) {
            currentMailSettings = currentMailSettings.second
        }
        try {
            let transporter
            if(currentMailSettings.directTransport){
                transporter = nodemailerDirectTransport(currentMailSettings)
                if(currentMailSettings.dkim) {
                    message.dkim = currentMailSettings.dkim
                }
            }else {
                transporter = {
                    service: currentMailSettings.service,
                    debug: currentMailSettings.debug || false,
                    logger: currentMailSettings.logger || false,
                    host: currentMailSettings.host,
                    port: currentMailSettings.port,
                    secure: !!currentMailSettings.secure,
                    auth: {
                        user: currentMailSettings.user,
                        pass: currentMailSettings.password
                    },
                    dkim: currentMailSettings.dkim,
                    tls: {
                        // do not fail on invalid certs
                        rejectUnauthorized: false
                    },
                    connectionTimeout: currentMailSettings.connectionTimeout || 120000,
                    socketTimeout: currentMailSettings.socketTimeout || 1220000
                }
            }


            if (currentMailSettings.returnPath) {
                message.envelope = {
                    from: currentMailSettings.returnPath,
                    to: recipients.concat(ccRecipients)
                }
            }else{
                delete message.envelope
            }

            Hook.call('beforeMailSend', {db, context, slug, message, transporter, req})

            const transporterResult = nodemailer.createTransport(transporter)
            mailResponse = await transporterResult.sendMail(message)

            break
        } catch (e) {
            console.log('sendMail Error', e)
            mailResponse = e
            if (currentMailSettings.second && currentMailSettings.useSecond!==false) {
                currentMailSettings = currentMailSettings.second
            } else {
                break
            }
        }
    }

    Hook.call('mailSent', {db, context, slug, mailResponse, req, message})
    return mailResponse
}

