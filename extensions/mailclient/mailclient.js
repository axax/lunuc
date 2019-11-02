import notifier from 'mail-notifier'
import Hook from '../../util/hook'
import Util from '../../api/util'

let mailListeners = {}

const startListening = async (db) => {
    const arr = (await db.collection('MailClient').find({active: true}).toArray())

    arr.forEach(async data => {
            // only if execfilter matches connect bot to messangers
            if (!data.execfilter || Util.matchFilterExpression(data.execfilter, Util.systemProperties())) {


                const mailListener = notifier({
                    username: data.username,
                    password: data.password,
                    host: data.host,
                    port: 993, // imap port
                    tls: true,
                    connTimeout: 10000, // Default by node-imap
                    authTimeout: 5000, // Default by node-imap,
                    debug: console.log, // Or your custom function with only one incoming argument. Default: null
                    tlsOptions: {rejectUnauthorized: false},
                    mailbox: 'INBOX', // mailbox to monitor
                    searchFilter: ['UNSEEN', 'FLAGGED'], // the search filter being used after an IDLE notification has been retrieved
                    markSeen: true, // all fetched email willbe marked as seen and not fetched next time
                    fetchUnreadOnStart: false, // use it only if you want to get all unread email on lib start. Default is `false`,
                    mailParserOptions: {streamAttachments: true}, // options to be passed to mailParser lib.
                    attachments: true, // download attachments as they are encountered to the project directory
                    /*attachmentOptions: { directory: "attachments/" }*/ // specify a download directory for attachments
                })

                mailListener.on('mail', mail => {
                    Hook.call('OnMail', {mail, db})
                }).start()

                mailListeners[data._id] = mailListener
            }

        }
    )
}


const stopListening = (db) => {
    Object.keys(mailListeners).forEach(id => {
        mailListeners[id].stop()
        delete mailListeners[id]
    })

    mailListeners = {}
}

export {startListening, stopListening}
