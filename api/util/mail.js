import Util from './index'
import Hook from '../../util/hook'
import nodemailer from 'nodemailer'

/*
 A very basic implementation for sending emails
 it uses the mail settings from the global key value store
 */


export const sendMail = async (db, context, {settings, recipient, from, replyTo, subject, body, html, text, slug, headerList, attachments, req}) => {
    let mailSettings
    if(settings){
        mailSettings = settings
    }else {
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
    } else if (body) {
        finalHtml = body
    }

    const message = {
        replyTo,
        from: from || mailSettings.from,
        to: recipient,
        subject: subject,
        text, //'Plaintext version of the message'
        html: finalHtml,
        attachments,
        list: headerList
    }

    let mailResponse

    let currentMailSettings = mailSettings
    while(true) {
        if(currentMailSettings.useSecond && currentMailSettings.second){
            currentMailSettings = currentMailSettings.second
        }
        try {
            const transporter = nodemailer.createTransport({
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
                connectionTimeout: currentMailSettings.connectionTimeout || 30000,
                socketTimeout: currentMailSettings.socketTimeout || 90000
            })
            mailResponse = await transporter.sendMail(message)
            break
        } catch (e) {
            console.log('sendMail', e)
            mailResponse = e.message
            if(currentMailSettings.second){
                currentMailSettings = currentMailSettings.second
            }else{
                break
            }
        }
    }

    Hook.call('mailSent', {db, context, slug, mailResponse, req, message})
    return mailResponse
}

