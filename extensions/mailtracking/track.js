import Util from '../../api/util'

export const trackMail = async ({db, context, slug, mailResponse, req, message}) => {

    const insertData = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
        slug,
        response: mailResponse,
        createdBy: await Util.userOrAnonymousId(db, context)
    }

    db.collection('MailTracking').insertOne(insertData).then(result => {
    }).catch(err => {
        // handle error
    })


}
