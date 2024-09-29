import {SMTPServer} from 'smtp-server'
import {getHostRules, hostListFromString} from '../../../util/hostrules.mjs'
import {simpleParser} from 'mailparser'
import mailserverResolver from '../gensrc/resolver.mjs'
import config from '../../../gensrc/config.mjs'
import {getFolderForMailAccount, getMailAccountByEmail, getMailAccountFromMailData} from '../util/dbhelper.mjs'
import nodemailerDirectTransport from 'nodemailer-direct-transport'
import nodemailer from 'nodemailer'
import {isTemporarilyBlocked} from '../../../server/util/requestBlocker.mjs'
import Util from '../../../api/util/index.mjs'
import {detectSpam} from './spam.mjs'

/*
// open port 25 and 587 on your server
sudo ufw allow 25
sudo ufw allow 587

// add dns records

mail.domain.xx	IN	A	144.91.119.30
domain.xx	IN	MX	10  mail.domain.xx
domain.xx	IN	TXT	"v=spf1 ip4:144.91.119.30 -all"

// reverse dns
add Reverse-DNS (PTR-Record) -> service provider

 */

let serverPorts = {}
const startListening = async (db, context) => {

    for(const port of config.SMTP_PORTS) {
        console.log(`Start SMTP Server listening on port ${port}`, context)

        serverPorts[port] = new SMTPServer({
            logger: false,
            secure: false,
            banner: 'Welcome to Lunuc SMTP Server',
            authMethods: ['PLAIN', 'LOGIN', /*'CRAM-MD5','XOAUTH2'*/ ],
            useXClient: true,
            hidePIPELINING: true,
            useXForward: true,
            size: 10 * 1024 * 1024,
            authOptional: true,
            /*needsUpgrade:true,*/
            SNICallback: (domain, cb) => {
                if (domain.startsWith('www.')) {
                    domain = domain.substring(4)
                }
                const hostsChecks = hostListFromString(domain)
                const hostrules = getHostRules(true)

                for (let i = 0; i < hostsChecks.length; i++) {
                    const currentHost = hostsChecks[i]
                    const hostrule = hostrules[currentHost]
                    if (hostrule && hostrule.certContext) {
                        console.log(`smtp server certContext for ${currentHost}`)
                        cb(null, hostrule.certContext)
                        return
                    }
                }
                cb()
            },
            onAuth: async (auth, session, callback) => {

                console.debug('SMTP onAuth', {...auth,password:'*****'}, session)
                const mailAccount = await getMailAccountByEmail(db, auth.username)
                const generalInvalidLoginMessage = 'Invalid username or password'

                if (!mailAccount) {
                    return callback(new Error(generalInvalidLoginMessage))
                    /*return callback(null, {
                        data: {
                            status: "401",
                            schemes: "bearer mac",
                            scope: "my_smtp_access_scope_name",
                        },
                    })*/
                }


                if (auth.method === 'LOGIN' || auth.method === 'PLAIN') {
                    if (!Util.compareWithHashedPassword(auth.password, mailAccount.password)) {
                        return callback(new Error(generalInvalidLoginMessage))
                    }
                }else if (auth.method === 'CRAM-MD5'){
                    // it is not really working as we don't want to store the password unencrypted
                    if (!auth.password || !auth.validatePassword(auth.password)) {
                        return callback(new Error(generalInvalidLoginMessage));
                    }
                }else{
                    return callback(new Error(`Authentication needed or auth method ${auth.method} - ${auth.accessToken} invalid`))
                }


                /*   if (auth.method !== "XOAUTH2") {
                       // should never occur in this case as only XOAUTH2 is allowed
                       return callback(new Error("Expecting XOAUTH2"));
                   }
                   if (auth.username !== "abc" || auth.accessToken !== "def") {
                       return callback(null, {
                           data: {
                               status: "401",
                               schemes: "bearer mac",
                               scope: "my_smtp_access_scope_name",
                           },
                       });
                   }*/

                callback(null, {user: auth.username}); // where 123 is the user id or similar property
            },
            onConnect(session, callback) {
                console.debug('SMTP onConnect', session)


                if(isTemporarilyBlocked({requestTimeInMs: 3000, requestPerTime: 5,requestBlockForInMs:60000, key:'smtpConnection'})){
                    return callback(new Error("No connections allowed"))
                }

                if (session.remoteAddress === "127.0.0.1") {
                    //    return callback(new Error("No connections from localhost allowed"));
                }
                return callback() // Accept the connection
            },
            onSecure(socket, session, callback) {
                console.debug('SMTP onSecure', session)

                const mailserverList = Object.keys(getHostRules(false)).map(h=>`mail.${h}`)

                if (session.localAddress !== session.remoteAddress && session.servername && mailserverList.indexOf(session.servername)<0) {
                    return callback(new Error(`Only connections for ${session.servername} are allowed`))
                }
                return callback(); // Accept the connection
            },
            onMailFrom: async (address, session, callback) => {
                console.debug('SMTP onMailFrom', address, session)

                /* const mailAccount = await getMailAccountByEmail(db, session.user)

                 if (!mailAccount) {
                     return callback(new Error(`Mail account ${session.user} doesen't exist`))
                 }*/

             /*   { address: 'simon@simra.ch', args: false } {
                      id: 'gcvbczrb6unqhl7j',
                       secure: true,
                       localAddress: '144.91.119.30',
                       localPort: 587,
                       remoteAddress: '93.33.15.128',
                       remotePort: 50451,
                       clientHostname: '93-33-15-128.ip42.fastwebnet.it',
                       openingCommand: 'EHLO',
                       hostNameAppearsAs: 'smtpclient.apple',
                       xClient: Map(0) {},
                      xForward: Map(0) {},
                      transmissionType: 'ESMTPSA',
                      tlsOptions: {
                        name: 'ECDHE-RSA-AES128-GCM-SHA256',
                    3]:     standardName: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
                    3]:     version: 'TLSv1.2'
                      },
                      envelope: { mailFrom: false, rcptTo: [] },
                      transaction: 1,
                    3]:   servername: 'mail.simra.ch',
                    3]:   user: 'simon@simra.ch'
                    }
*/

                return callback(); // Accept the address
            },
            onRcptTo: async (address, session, callback) => {
                console.debug('SMTP onRcptTo', address, session)

                let mailAccount
                if (session.user) {
                    mailAccount = await getMailAccountByEmail(db, session.user)
                } else {
                    mailAccount = await getMailAccountByEmail(db, address.address)
                }

                if (!mailAccount) {
                    return callback(new Error(`Mail account ${session.user} doesen't exist`))
                }

                // do not accept messages larger than 1000 bytes to specific recipients
                let expectedSize = Number(session.envelope.mailFrom.args.SIZE) || 0
                if (expectedSize > 1000000) {
                    const err = new Error("Insufficient channel storage: " + address.address)
                    err.responseCode = 452
                    return callback(err)
                }
                callback()
            },
            onData: (stream, session, callback) => {
                const fromMail = session?.envelope?.mailFrom?.address
                console.debug('SMTP onData', fromMail, session)

                //stream.pipe(process.stdout); // print message to console
                stream.on("end", () => {
                    let err;
                    if (stream.sizeExceeded) {
                        err = new Error("Message exceeds fixed maximum message size")
                        err.responseCode = 552
                        return callback(err)
                    }
                    callback(null, "Message queued")
                })

                simpleParser(stream, {}, async (err, data) => {
                    if (err) {
                        console.log("Error:", err)
                    } else if (session.user) {
                        // send email
                        const transporter = nodemailerDirectTransport({
                            name: session.servername
                        })

                        const transporterResult = nodemailer.createTransport(transporter)

                        for (const rcpt of data.to.value) {
                            console.log('onData send', rcpt, data)
                            try {
                                await transporterResult.sendMail({
                                    ...data,
                                    to: rcpt.address,
                                    from: fromMail
                                })
                            }catch (e){
                                console.log(`error sending email to ${rcpt.address} from ${fromMail}`, e)
                            }
                        }

                    } else {

                        if(data && data.attachments){
                            data.attachments.forEach(attachment=>{
                                // otherwise message ends up empty in the inbox
                                if(!attachment.encoding && attachment.headers &&
                                    attachment.headers.constructor === Map &&
                                    attachment.headers.has('content-transfer-encoding')){
                                    attachment.encoding = attachment.headers.get('content-transfer-encoding')
                                }
                            })
                        }

                        // email received
                        let mailAccount = await getMailAccountFromMailData(db, data)
                        if (mailAccount && mailAccount.active) {

                            const sender = data.headers.get('sender') || data.headers.get('from') || {}

                            const isSpam = await detectSpam(db, context, {threshold: mailAccount.spamThreshold, sender:sender.text,text:data.subject+data.text})
                            const inbox = await getFolderForMailAccount(db, mailAccount._id, isSpam?'Junk':'INBOX')

                            if(isSpam){
                                data.subject = "***SPAM***" + (data.subject || '')
                            }

                            await mailserverResolver(db).Mutation.createMailAccountMessage({
                                mailAccount: mailAccount._id,
                                mailAccountFolder: inbox._id,
                                data
                            }, {context}, false)

                            const contentType = data.headers.get('content-type') || {}

                            if(mailAccount.redirect && contentType?.params?.[`report-type`]!=='delivery-status'){

                                // send email
                                const transporter = nodemailerDirectTransport({
                                    name: `mail.${mailAccount.host}`,
                                })

                                const transporterResult = nodemailer.createTransport(transporter)

                                const recipients = mailAccount.redirect.split(',')


                                let replyTo = data?.from?.value && data.from.value.length > 0?data.from.value[0]:{}

                                for (const rcpt of recipients) {
                                    console.log('onData send forward', rcpt, replyTo)

                                    const message = {
                                       /* cc: data.cc,
                                        bcc: data.bcc,*/
                                        /*envelope: {
                                            from: `<${replyTo.address}>`,
                                            to: rcpt
                                        },*/
                                        inReplyTo: data.messageId,
                                        replyTo: replyTo.address,
                                        from: `${mailAccount.username}@${mailAccount.host}`,
                                        to: rcpt,
                                        subject: `${data.subject}`,
                                        text: data.text, //'Plaintext version of the message'
                                        html: data.html,
                                        attachments: data.attachments
                                    }

                                    try {
                                        await transporterResult.sendMail(message)
                                    }catch (e){
                                        console.log(`error forward email to ${rcpt.address} from ${mailAccount.username}@${mailAccount.host}`)
                                        console.log(e)
                                    }
                                }

                            }

                        } else {
                            console.warn(`no mail account for`, data?.to?.text)
                        }
                    }
                })

            }
        })
        serverPorts[port].on("error", (err) => {
            console.log("SMTP Error", err)
        })
        serverPorts[port].listen(port)
    }
}


const stopListening = () => {

}

export default {startListening, stopListening}
