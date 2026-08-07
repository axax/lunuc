import Util from '../../api/util/index.mjs'
import {replaceAttachmentInMailData} from '../mailserver/util/dbhelper.mjs'

export const trackMail = async ({db, context, slug, mailResponse, req, message}) => {

    const createdBy = await Util.userOrAnonymousId(db, context)

    if (message.attachments) {
        for (const attachment of message.attachments) {
            await replaceAttachmentInMailData(attachment, 'trackMail-' + createdBy.toString(), {db})
        }
    }

    const insertData = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
        slug,
        response: mailResponse,
        createdBy
    }

    db.collection('MailTracking').insertOne(insertData).then(result => {
    }).catch(err => {
        // handle error
    })
}
