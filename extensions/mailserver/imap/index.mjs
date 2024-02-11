import IMAPConnection from './IMAPConnection'
import IMAPFlag from './IMAPFlag'
import IMAPProcessor from './IMAPProcessor'
import IMAPServer from './IMAPServer'
import IMAPState from './IMAPState'



let server
const startListening = async (db, context) => {

    const server = new IMAPServer({});

    const mailBox = [
        {
            name: "Trash",
        },
        {
            name: "Inbox"
        }
    ]

    server.onAuth = (auth, connection, callback) => {
        console.log('IMAP onAuth', auth, connection)
        callback(null, "sammwy");
    };

    server.onList = (filter, connection, callback) => {
        console.log('IMAP onList', name, connection)
        callback(null, mailBox);
    };

    server.onCreate = (name, connection, callback) => {
        //mailBox.push({
        //  name
        //})
        console.log('IMAP onCreate', name, connection)

        callback();
    }

    server.onSubscribe = (name, connection, callback) => {
        console.log('IMAP onSubscribe', name, connection)
        callback();
    }


    server.onError = (err) => {
        console.log('IMAP onError', err)
    }

    server.listen(143) /*, "127.0.0.1", 1024, () => {
        console.log("IMAP Server Listening");
    })*/
    console.log("IMAP Server Listening")
}


const stopListening = () => {

}

export default {startListening, stopListening}