import Hook from '../../util/hook.cjs'
import Util from '../../api/util/index.mjs'
import {SMTPServer} from 'smtp-server'
import {loadAllHostrules} from '../../util/hostrules.mjs'

const hostrules = loadAllHostrules(true)

let server
const startListening = (db, context) => {
    console.log(`Start SMTP Server`)
    server = new SMTPServer({
        secure: true,
        SNICallback: (domain, cb) => {
            if (domain.startsWith('www.')) {
                domain = domain.substring(4)
            }
            if (hostrules[domain] && hostrules[domain].certContext) {
                cb(null, hostrules[domain].certContext)
            } else {
                cb()
            }
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
        size: 1024, // allow messages up to 1 kb
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
        console.log("Error %s", err.message)
    })
    server.listen(465)
}


const stopListening = () => {

}

export {startListening, stopListening}
