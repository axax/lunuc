import Imap from 'imap'
import { simpleParser } from 'mailparser'
import Hook from '../../util/hook.cjs'
import Util from '../../api/util/index.mjs'

let mailListeners = {}
let errorTimeout

const startListening = async (db, context) => {
    try {
        const arr = (await db.collection('MailClient').find({active: true}).toArray())
        const admin = await Util.userByName(db, 'admin')

        for (const data of arr) {
            // only if execfilter matches, connect the mail listener
            startListeningSingle(data, db, context, admin)
        }
    } catch (e) {
        console.error(e)
    }
}

const scheduleRestart = (db, context) => {
    clearTimeout(errorTimeout)
    errorTimeout = setTimeout(() => {
        console.log('restart email listening')
        stopListening()
        startListening(db, context)
    }, 5000)
}

const startListeningSingle = (data, db, context, admin) => {
    if (data.execfilter && !Util.execFilter(data.execfilter)) {
        return
    }

    console.log(`register MailClient ${data.username}`)

    const imap = new Imap({
        user: data.username,
        password: data.password,
        host: data.host,
        port: 993, // imap port
        tls: true,
        connTimeout: 30000, // connection timeout
        authTimeout: 15000, // authentication timeout
        tlsOptions: {rejectUnauthorized: false}
        // debug: console.log // uncomment for verbose imap logging
    })

    // process new messages: search, fetch and parse
    const processMail = () => {
        // search filter applied after an IDLE notification
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const dateStr = oneYearAgo.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        imap.search([ 'UNSEEN', ['SINCE', dateStr] ], (err, results) => {
            console.log(results)
            if (err) {
                console.error(err)
                Hook.call('OnMailError', {db, context, error: err})
                return
            }
            if (!results || results.length === 0) {
                return
            }

            const fetch = imap.fetch(results, {
                bodies: '', // fetch the full raw message
                markSeen: data.markSeen ? true : false
            })

            fetch.on('message', (msg) => {
                msg.on('body', (stream) => {
                    // mailparser v3 can parse the stream directly
                    simpleParser(stream, (parseErr, mail) => {
                        if (parseErr) {
                            console.error('error parsing mail', parseErr)
                            return
                        }
                        handleParsedMail(mail, data, db, context, admin)
                    })
                })
            })

            fetch.once('error', (fetchErr) => {
                console.error('fetch error', fetchErr)
                Hook.call('OnMailError', {db, context, error: fetchErr})
            })
        })
    }

    imap.once('ready', () => {
        imap.openBox('INBOX', false, (err) => {
            if (err) {
                console.error(err)
                Hook.call('OnMailError', {db, context, error: err})
                return
            }

            // node-imap automatically uses IDLE when the server supports it
            // and emits 'mail' whenever new messages arrive
            imap.on('mail', () => {
                processMail()
            })
            // optionally process unread mail on start --> not jet implemented
            if (data.fetchUnreadOnStart) {
                processMail()
            }
        })
    })

    imap.on('error', (error) => {
        console.error(error)
        Hook.call('OnMailError', {db, context, error})

        if (error && error.message && error.message.indexOf('ETIMEDOUT') >= 0) {
            scheduleRestart(db, context)
        }
    })

    imap.once('end', () => {
        Hook.call('OnMailError', {db, context, error: {message: 'mail ended for ' + data.username}})
        // try to start again --> if active=false it is not started
        scheduleRestart(db, context)
    })

    imap.once('close', (hadError) => {
        Hook.call('OnMailError', {db, context, error: {message: 'closed for ' + data.username, hadError}})
    })

    imap.connect()

    mailListeners[data._id] = imap
}

const handleParsedMail = (mail, data, db, context, admin) => {
    if (data.archive) {
        db.collection('MailClientArchive').insertOne({
            client: data._id,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
            // mailparser v3 exposes headers as a Map
            to: mail.to ? mail.to.text : (mail.headers.get('to') || null),
            from: mail.from ? mail.from.text : (mail.headers.get('from') || null),
            receivedDate: mail.date ? new Date(mail.date) : new Date(),
            priority: mail.priority,
            messageId: String(mail.messageId || ''),
            createdBy: admin._id
        })
    }

    try {
        Hook.call('OnMail', {mail, db, context})
    } catch (e) {
        console.error('error in OnMail Hook', e)
    }
}

const stopListening = () => {
    Object.keys(mailListeners).forEach((id) => {
        try {
            mailListeners[id].end()
        } catch (e) {
            console.error('error stopping mail listener', e)
        }
        delete mailListeners[id]
    })

    mailListeners = {}
}

export {startListening, stopListening}