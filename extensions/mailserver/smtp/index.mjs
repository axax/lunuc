import {SMTPServer} from 'smtp-server'
import {getHostRules, hostListFromString} from '../../../util/hostrules.mjs'
import {simpleParser} from 'mailparser'
import mailserverResolver from '../gensrc/resolver.mjs'
import config from '../../../gensrc/config.mjs'
import {getFolderForMailAccount, getMailAccountByEmail, getMailAccountFromMailData} from '../util/dbhelper.mjs'
import nodemailerDirectTransport from 'nodemailer-direct-transport'
import nodemailer from 'nodemailer'

/*
// open port 25 on your server
sudo ufw allow 587

// add dns records

mail.domain.xx	IN	A	144.91.119.30
domain.xx	IN	MX	10  mail.domain.xx
domain.xx	IN	TXT	"v=spf1 ip4:144.91.119.30 -all"

 */



let server
const startListening = async (db, context) => {
    console.log(`Start SMTP Server`, context)

    server = new SMTPServer({
        logger: false,
        secure: false,
        banner: 'Welcome to Lunuc SMTP Server',
        authMethods: ['PLAIN', 'LOGIN', 'CRAM-MD5','XOAUTH2'],
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

            console.log('SMTP onAuth',auth,session)
            const mailAccount = await getMailAccountByEmail(db, auth.username)

            if(!mailAccount){
                return callback(null, {
                    data: {
                        status: "401",
                        schemes: "bearer mac",
                        scope: "my_smtp_access_scope_name",
                    },
                })
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
            callback(null, { user: auth.username }); // where 123 is the user id or similar property
        },
        onConnect(session, callback) {
            console.log('SMTP onConnect',session)
            if (session.remoteAddress === "127.0.0.1") {
            //    return callback(new Error("No connections from localhost allowed"));
            }
            return callback() // Accept the connection
        },
        onSecure(socket, session, callback) {
            console.log('SMTP onSecure',session)

            if (session.localAddress !== session.remoteAddress && session.servername !=='mail.simra.ch') {
                return callback(new Error('Only connections for mail.simra.ch are allowed'))
            }
            return callback(); // Accept the connection
        },
        onMailFrom: async (address, session, callback) => {
            console.log('SMTP onMailFrom',address, session)

           /* const mailAccount = await getMailAccountByEmail(db, session.user)

            if (!mailAccount) {
                return callback(new Error(`Mail account ${session.user} doesen't exist`))
            }*/

            return callback(); // Accept the address
        },
        onRcptTo: async (address, session, callback) => {
            console.log('SMTP onRcptTo',address, session)

            let mailAccount
            if(session.user){
                mailAccount = await getMailAccountByEmail(db, session.user)
            }else{
                mailAccount = await getMailAccountByEmail(db, address.address)
            }

            if (!mailAccount) {
                return callback(new Error(`Mail account ${session.user} doesen't exist`))
            }

            // do not accept messages larger than 1000 bytes to specific recipients
            let expectedSize = Number(session.envelope.mailFrom.args.SIZE) || 0
            if (expectedSize > 100000) {
                const err = new Error("Insufficient channel storage: " + address.address)
                err.responseCode = 452
                return callback(err)
            }
            callback()
        },
        onData: (stream, session, callback) => {
            const fromMail = session?.envelope?.mailFrom?.address
            console.log('onData',fromMail, session)
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
                } else if(session.user){
                    // send email
                    const transporter = nodemailerDirectTransport({
                        name: 'mail.simra.ch'
                    })

                    const transporterResult = nodemailer.createTransport(transporter)

                    console.log('xxxx',data)

                    for(const rcpt of data.to.value){
                        console.log('xxxx2',rcpt)
                        const mailResponse = await transporterResult.sendMail({...data,to:rcpt.address,from:fromMail})
                        console.log(mailResponse)
                    }

                }else {
                    // email received
                    let mailAccount = await getMailAccountFromMailData(db, data)
                    if (mailAccount && mailAccount.active) {

                        const inbox = await getFolderForMailAccount(db, mailAccount._id, 'INBOX')

                        await mailserverResolver(db).Mutation.createMailAccountMessage({
                            mailAccount: mailAccount._id,
                            mailAccountFolder: inbox._id,
                            data
                        }, {context}, false)
                    } else {
                        console.warn(`no mail account for`, data)
                    }
                }
            })

        }
    })
    server.on("error", (err) => {
        console.log("SMTP Error", err)
    })
    server.listen(config.SMTP_PORT)
}


const stopListening = () => {

}

export default {startListening, stopListening}
