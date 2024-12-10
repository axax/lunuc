import Util from './index.mjs'
import Hook from '../../util/hook.cjs'
import nodemailer from 'nodemailer'
import {replacePlaceholders} from '../../util/placeholders.mjs'
import nodemailerDirectTransport from 'nodemailer-direct-transport'
import {replaceRelativeUrls} from './toAbsoluteUrls.mjs'





/*
 A very basic implementation for sending emails
 it uses the mail settings from the global key value store
 */

export const sendMail = async (db, context, {settings, recipient, from, fromName, replyTo, subject, body, html, text, slug, headerList, headers, attachments, req}) => {

    if (!recipient || !Util.validateEmail(recipient)) {
        return {error: `Recipient ${recipient} is not valid`}
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
        finalHtml = await Hook.hooks['cmsTemplateRenderer'][0].callback({
            context,
            db,
            recipient,
            subject,
            body,
            slug,
            req
        })

        finalHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
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

    //replace relative urls with absolute urls
    if(req?.headers?.host){
        finalHtml = replaceRelativeUrls(finalHtml, `https://${req.headers.host}`)
    }

    let fromFinal = from || mailSettings.from

    if (fromName && !fromFinal.endsWith('>')) {
        fromFinal = `${fromName} <${fromFinal}>`
    }

    let replyToFinal = replyTo

    if(!replyToFinal && settings && settings.replyTo){
        replyToFinal = settings.replyTo
    }
    if(!replyToFinal && mailSettings && mailSettings.replyTo){
        replyToFinal = mailSettings.replyTo
    }

    let finalText = text?text.trim():''
    if(!finalText){
        finalText = finalHtml.replace(/<[^>]*>/g, ' ').replace(/\s\s+/g, ' ')
    }

    const message = {
        replyTo: replyToFinal,
        from: fromFinal,
        to: recipient,
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
                    to: recipient
                }
            }else{
                delete message.envelope
            }

            Hook.call('beforeMailSend', {db, context, slug, message, transporter, req})

            const transporterResult = nodemailer.createTransport(transporter)
            mailResponse = await transporterResult.sendMail(message)
            break
        } catch (e) {
            console.log('sendMail', e)
            mailResponse = e.message
            if (currentMailSettings.second) {
                currentMailSettings = currentMailSettings.second
            } else {
                break
            }
        }
    }

    Hook.call('mailSent', {db, context, slug, mailResponse, req, message})
    return mailResponse
}

