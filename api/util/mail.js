import Util from "./index";
import Hook from "../../util/hook";
import nodemailer from "nodemailer";

export const sendMail = async (db, context, {recipient, subject, body, slug}) =>
{
    const values = await Util.keyValueGlobalMap(db, context, ['MailSettings'])

    const mailSettings = values.MailSettings
    if (!mailSettings) {
        throw new Error('Mail settings are missing. Please add MailSettings as a global value')
    }

    let html
    if (slug && 'undefined' != typeof (Hook.hooks['cmsTemplateRenderer']) && Hook.hooks['cmsTemplateRenderer'].length) {
        html = await Hook.hooks['cmsTemplateRenderer'][0].callback({
            context,
            db,
            recipient,
            subject,
            body,
            slug
        })
    } else {
        html = body
    }

    const message = {
        from: mailSettings.from,
        to: recipient,
        subject: subject,
        text: 'Plaintext version of the message',
        html
    }

    var transporter = nodemailer.createTransport({
        service: mailSettings.service,
        auth: {
            user: mailSettings.user,
            pass: mailSettings.password
        }
    })

    const response = await transporter.sendMail(message)
    return response
}