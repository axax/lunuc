import Util from './index'
import Hook from '../../util/hook'
import nodemailer from 'nodemailer'

/*
 A very basic implementation for sending emails
 it uses the mail settings from the global key value store
 */


export const sendMail = async (db, context, {settings, recipient, from, subject, body, html, text, slug, attachments, req}) => {
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

        finalHtml = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width">
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
        from: from || mailSettings.from,
        to: recipient,
        subject: subject,
        text, //'Plaintext version of the message'
        html: finalHtml,
        attachments
    }


    var transporter = nodemailer.createTransport({
        service: mailSettings.service,
        host: mailSettings.host,
        port: mailSettings.port,
        secure: !!mailSettings.secure,
        auth: {
            user: mailSettings.user,
            pass: mailSettings.password
        }
    })

    const response = await transporter.sendMail(message)
    return response
}

