import Util from '../../../api/util/index.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {ObjectId} from 'mongodb'
import {sendMail} from '../../../api/util/mail.mjs'

export default db => ({
    Query: {
        resendMail: async ({ids}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            let response = ''
            for(const id of ids){

                const mail = (await db.collection('MailTracking').findOne({_id: new ObjectId(id)}))

                if(mail) {
                    const mailResponse = await sendMail(db, context,
                        {
                            recipient: mail.to,
                            from: mail.from,
                            subject: mail.subject,
                            html: mail.html,
                            text: mail.text,
                            attachments: mail.attachments})

                    response += mailResponse.response
                }

            }

            return {response}
        }
    }
})
