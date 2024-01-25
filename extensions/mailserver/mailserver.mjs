import Hook from '../../util/hook.cjs'
import Util from '../../api/util/index.mjs'
import {SMTPServer} from 'smtp-server'
import {getHostRules, hostListFromString} from '../../util/hostrules.mjs'

/*
// open port 25 on your server
sudo ufw allow 25

// add dns records

mail.domain.xx	IN	A	144.91.119.30
domain.xx	IN	MX	10  mail.domain.xx
domain.xx	IN	TXT	"v=spf1 ip4:144.91.119.30 -all"

 */

let server
const startListening = (db, context) => {
    console.log(`Start SMTP Server`)
    server = new SMTPServer({
        logger: true,
        secure: false,
        banner: 'Welcome to Lunuc SMTP Server',
        authMethods: ['PLAIN', 'LOGIN', 'CRAM-MD5','XOAUTH2'],
        useXClient: true,
        hidePIPELINING: true,
        useXForward: true,
        size: 10 * 1024 * 1024,
        authOptional: true,
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
        /*needsUpgrade:true,*/
        /*key: fs.readFileSync("private.key"),
        cert: fs.readFileSync("server.crt"),*/
        /*authMethods: ["XOAUTH2"], */// XOAUTH2 is not enabled by default
        /*SNICallback(servername, cb) {
            console.log('xxxxxxxxxxxxx',servername)
            cb(null, this.secureContext.get(servername));
        },*/
        onAuth(auth, session, callback) {

            console.log('onAuth',session)
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
            callback(null, { user: 123 }); // where 123 is the user id or similar property
        },
        onConnect(session, callback) {
            console.log('onConnect',session)
            if (session.remoteAddress === "127.0.0.1") {
            //    return callback(new Error("No connections from localhost allowed"));
            }
            return callback(); // Accept the connection
        },
        onSecure(socket, session, callback) {
            console.log('onSecure',session)
            if (session.servername !== "sni.example.com") {
               // return callback(new Error("Only connections for sni.example.com are allowed"));
            }
            return callback(); // Accept the connection
        },
        onMailFrom(address, session, callback) {
            console.log('onMailFrom',address, session)
            if (address.address !== "allowed@example.com") {
                //return callback(new Error("Only allowed@example.com is allowed to send mail"));
            }
            return callback(); // Accept the address
        },
        onRcptTo(address, session, callback) {
            console.log('onRcptTo',address, session)
            // do not accept messages larger than 100 bytes to specific recipients
            let expectedSize = Number(session.envelope.mailFrom.args.SIZE) || 0;
            if (address.address === "almost-full@example.com" && expectedSize > 100) {
                err = new Error("Insufficient channel storage: " + address.address);
                err.responseCode = 452;
                return callback(err);
            }
            callback();
        },
        onData(stream, session, callback) {
            console.log('onData',session)
            stream.pipe(process.stdout); // print message to console
            stream.on("end", () => {
                let err;
                if (stream.sizeExceeded) {
                    err = new Error("Message exceeds fixed maximum message size");
                    err.responseCode = 552;
                    return callback(err);
                }
                callback(null, "Message queued as abcdef");
            });
        },
    })
    server.on("error", (err) => {
        console.log("SMTP Error", err)
    })
    server.listen(25)
}


const stopListening = () => {

}

export {startListening, stopListening}
