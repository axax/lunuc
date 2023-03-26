import notifier from 'mail-notifier'
import Hook from '../../util/hook.cjs'
import Util from '../../api/util/index.mjs'

let mailListeners = {}

const startListening = async (db, context) => {

    try {
        const arr = (await db.collection('MailClient').find({active: true}).toArray())

        const admin = await Util.userByName(db, 'admin')

        for (const data of arr){
            // only if execfilter matches connect bot to messangers
            startListeningSingle(data, db, context, admin)
        }

    }catch (e) {
        console.error(e)
    }
}


const startListeningSingle = (data, db, context, admin) => {
    if (!data.execfilter || Util.execFilter(data.execfilter)) {
        console.log(`register MailClient ${data.username}`)


        const mailListener = notifier({
            username: data.username,
            password: data.password,
            host: data.host,
            port: 993, // imap port
            tls: true,
            connTimeout: 30000, // Default by node-imap
            authTimeout: 15000, // Default by node-imap,
            debug: console.log, // Or your custom function with only one incoming argument. Default: null
            tlsOptions: {rejectUnauthorized: false},
            mailbox: 'INBOX', // mailbox to monitor
            searchFilter: ['UNSEEN', 'FLAGGED'], // the search filter being used after an IDLE notification has been retrieved
            markSeen: data.markSeen ? true : false, // all fetched email willbe marked as seen and not fetched next time
            fetchUnreadOnStart: false, // use it only if you want to get all unread email on lib start. Default is `false`,
            mailParserOptions: {streamAttachments: true}, // options to be passed to mailParser lib.
            attachments: false, // download attachments as they are encountered to the project directory
            /*attachmentOptions: { directory: "attachments/" }*/ // specify a download directory for attachments
        })

        mailListener.on('error', error => {
            console.error(error)
            Hook.call('OnMailError', {db, context, error})
        })

        mailListener.on('end', () => {

            Hook.call('OnMailError', {db, context, error: {message: 'mailended for ' + data.username}})

            // start again
            setTimeout(()=>{
                startListeningSingle(data, db, context, admin)
            },1000)
            
        })

        mailListener.on('mail', mail => {
            if (data.archive) {
                db.collection('MailClientArchive').insertOne({
                    client: data._id,
                    subject: mail.subject,
                    text: mail.text,
                    html: mail.html,
                    to: mail.headers.to,
                    from: mail.headers.from,
                    receivedDate: new Date(mail.receivedDate),
                    priority: mail.priority,
                    messageId: String(mail.messageId || mail.uuid),
                    createdBy: admin._id
                })
            }
            try {
                Hook.call('OnMail', {mail, db, context})
            } catch (e) {
                console.error('error in OnMail Hook', e)
            }
        }).start()

        mailListeners[data._id] = mailListener
    }
}

const stopListening = (db) => {
    Object.keys(mailListeners).forEach(id => {
        mailListeners[id].stop()
        delete mailListeners[id]
    })

    mailListeners = {}
}

export {startListening, stopListening}
