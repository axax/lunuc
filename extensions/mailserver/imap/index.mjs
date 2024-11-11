import Wildduck from 'wildduck/imap-core'
import parseMimeTree from 'wildduck/imap-core/lib/indexer/parse-mime-tree'
import imapHandler from 'wildduck/imap-core/lib/handler/imap-handler'
import {getHostRules, hostListFromString, getRootCertContext} from '../../../util/hostrules.mjs'
import {
    getMailAccountByEmail,
    getFoldersForMailAccount,
    getSubscribedFoldersForMailAccount,
    getFolderForMailAccount,
    getMessageUidsForFolderId,
    getMessagesForFolder,
    getMessagesForFolderByUids,
    getFolderForMailAccountById,
    deleteMessagesForFolderByUids, getMailAccountFromMailData
} from '../util/dbhelper.mjs'
import {replaceAddresseObjectsToString} from '../util/index.mjs'
import Util from '../../../api/util/index.mjs'
import MemoryNotifier from './MemoryNotifier.js'
import MailComposer from 'nodemailer/lib/mail-composer'
import MailserverResolver from '../gensrc/resolver.mjs'
import {simpleParser} from 'mailparser'


// open port 993 on your server
// sudo ufw allow 993


//console.log(parseMimeTree())
/*simpleParser('MIME-Version: 1.0\r\n' +
    'From: andris@kreata.ee\r\n' +
    'To: andris@tr.ee\r\n' +
    'Content-Type: multipart/mixed;\r\n' +
    " boundary='----mailcomposer-?=_1-1328088797399'\r\n" +
    'Message-Id: <testmessage-for-bug>;\r\n' +
    '\r\n' +
    '------mailcomposer-?=_1-1328088797399\r\n' +
    'Content-Type: message/rfc822\r\n' +
    'Content-Transfer-Encoding: 7bit\r\n' +
    '\r\n' +
    'MIME-Version: 1.0\r\n' +
    'From: andris@kreata.ee\r\n' +
    'To: andris@pangalink.net\r\n' +
    'In-Reply-To: <test1>\r\n' +
    '\r\n' +
    'Hello world 1!\r\n' +
    '------mailcomposer-?=_1-1328088797399\r\n' +
    'Content-Type: message/rfc822\r\n' +
    'Content-Transfer-Encoding: 7bit\r\n' +
    '\r\n' +
    'MIME-Version: 1.0\r\n' +
    'From: andris@kreata.ee\r\n' +
    'To: andris@pangalink.net\r\n' +
    '\r\n' +
    'Hello world 2!\r\n' +
    '------mailcomposer-?=_1-1328088797399\r\n' +
    'Content-Type: text/html; charset=utf-8\r\n' +
    'Content-Transfer-Encoding: quoted-printable\r\n' +
    '\r\n' +
    '<b>Hello world 3!</b>\r\n' +
    '------mailcomposer-?=_1-1328088797399--\r\n', {
    skipHtmlToText:true
}, async (err, data) => {
    console.log('xxxxx',data,err)
})*/
let server

const startListening = async (db, context) => {


    // Setup server
    let server = server = new Wildduck.IMAPServer({
        secure:true,
        name: 'Lunuc IMAP Server',
        version: '1.0.0',
        vendor: 'lunuc.com',
        host: '0.0.0.0',
        port: 993,
        logger:false,
        markAsSeen:true,
        /*secured: false,
        disableSTARTTLS: true,
        ignoreSTARTTLS: true,
        useProxy: false,*/
        ignoredHosts: [],
        maxMessage: 25 * 1024 * 1024,
        enableCompression: true,
        SNICallback: (domain, cb) => {
            console.log('IMAP SNICallback',domain)
            if (domain.startsWith('www.')) {
                domain = domain.substring(4)
            }
            const hostsChecks = hostListFromString(domain)
            const hostrules = getHostRules(true)
            for (let i = 0; i < hostsChecks.length; i++) {
                const currentHost = hostsChecks[i]
                const hostrule = hostrules[currentHost]
                if (hostrule && hostrule.certContext) {
                    console.log(`imap server certContext for ${currentHost}`)
                    cb(null, hostrule.certContext)
                    return
                }
            }
            cb(null,getRootCertContext())
        }
    })

    server.notifier = new MemoryNotifier({
        logger: {
            info: () => false,
            debug: () => false,
            error: () => false
        }
    })

    server.on('error', err => {
        console.log('SERVER ERR\n%s', err.stack); // eslint-disable-line no-console
    });

    server.onAuth = async function (login, session, callback) {

        console.log('IMAP onAuth', login.username)

        const mailAccount = await getMailAccountByEmail(db, login.username)

        if (!mailAccount || !Util.compareWithHashedPassword(login.password, mailAccount.password)) {
            return callback(new Error(`Mail account ${login.username} doesen't exist or invalid credentials`))
        }

        callback(null, {
            user: {
                id: mailAccount._id,
                username: login.username
            }
        })
    }

    // LIST "" "*"
    // Returns all folders, query is informational
    // folders is either an Array or a Map
    server.onList = async function (query, session, callback) {
        console.log('IMAP onList', query, session.id)
        this.logger.debug('[%s] LIST for "%s"', session.id, query);

        const mailAccountFolders = await getFoldersForMailAccount(db, session.user.id)

        callback(null, mailAccountFolders)
    };

    // LSUB "" "*"
    // Returns all subscribed folders, query is informational
    // folders is either an Array or a Map
    server.onLsub = async function (query, session, callback) {
        this.logger.debug('[%s] LSUB for "%s"', session.id, query);
        console.log('IMAP onLsub', query, session.id)

        const subscribedFolders = await getSubscribedFoldersForMailAccount(db, session.user.id)

        callback(null, subscribedFolders);
    };

    // SUBSCRIBE "path/to/mailbox"
    server.onSubscribe = function (mailbox, session, callback) {
        console.log('IMAP onSubscribe', mailbox, session.id)
        this.logger.debug('[%s] SUBSCRIBE to "%s"', session.id, mailbox)
      /*  if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        subscriptions.add(folders.get(mailbox));*/
        callback(null, true);
    };

    // UNSUBSCRIBE "path/to/mailbox"
    server.onUnsubscribe = function (mailbox, session, callback) {
        console.log('IMAP onUnsubscribe', mailbox, session.id)
        /*this.logger.debug('[%s] UNSUBSCRIBE from "%s"', session.id, mailbox);

        if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        subscriptions.delete(folders.get(mailbox));*/
        callback(null, true);
    };

    // CREATE "path/to/mailbox"
    server.onCreate = async function (mailbox, session, callback) {
        console.log('IMAP onCreate', mailbox, session.id)
        this.logger.debug('[%s] CREATE "%s"', session.id, mailbox)

        const existingFolder = await getFolderForMailAccount(db,session.user.id,mailbox)

        if (existingFolder) {
            return callback(null, 'ALREADYEXISTS')
        }

       //const insertResult = await MailserverResolver(db).Mutation.createMailAccountFolder(destinationMessage, {context}, {skipCheck:true})


        /*folders.set(mailbox, {
            path: mailbox,
            uidValidity: Date.now(),
            uidNext: 1,
            modifyIndex: 0,
            messages: [],
            journal: []
        });

        subscriptions.add(folders.get(mailbox));*/
        callback(null, true)
    }

    // RENAME "path/to/mailbox" "new/path"
    // NB! RENAME affects child and hierarchy mailboxes as well, this example does not do this
    server.onRename = function (mailbox, newname, session, callback) {
        console.log('IMAP onRename', mailbox, session.id)
        /*this.logger.debug('[%s] RENAME "%s" to "%s"', session.id, mailbox, newname);

        if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        if (folders.has(newname)) {
            return callback(null, 'ALREADYEXISTS');
        }

        let oldMailbox = folders.get(mailbox);
        folders.delete(mailbox);

        oldMailbox.path = newname;
        folders.set(newname, oldMailbox);*/

        callback(null, true);
    };

    // DELETE "path/to/mailbox"
    server.onDelete = function (mailbox, session, callback) {
        console.log('IMAP onDelete', mailbox, session.id)
        /*this.logger.debug('[%s] DELETE "%s"', session.id, mailbox);

        if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        // keep SPECIAL-USE folders
        if (folders.get(mailbox).specialUse) {
            return callback(null, 'CANNOT');
        }

        folders.delete(mailbox);*/
        callback(null, true);
    };

    // SELECT/EXAMINE
    server.onOpen = async function (mailbox, session, callback) {
        console.log('IMAP onOpen', mailbox)
        this.logger.debug('[%s] Opening "%s"', session.id, mailbox);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT');
        }

        folder.uidList = await getMessageUidsForFolderId(db,folder._id)

        return callback(null, folder)
    }

    // STATUS (X Y X)
    server.onStatus = async function (folderId, session, callback) {
        console.log('IMAP onStatus', folderId)
        this.logger.debug('[%s] Requested status for "%s"', session.id, folderId)

        const folder = await getFolderForMailAccount(db, session.user.id, folderId)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        return callback(null, {
            messages: await db.collection('MailAccountMessage').count( {mailAccountFolder: folder._id} ),
            uidNext: folder.uidNext,
            uidValidity: folder.uidValidity,
            highestModseq: folder.modifyIndex,
            unseen: await db.collection('MailAccountMessage').count( {mailAccountFolder: folder._id, flags: {$nin:['\\Seen']}} )
        })
    };

    // APPEND mailbox (flags) date message
    server.onAppend = async function (mailbox, flags, date, raw, session, callback) {
        console.log('IMAP onAppend', mailbox, flags)
        this.logger.debug('[%s] Appending message to "%s"', session.id, mailbox);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'TRYCREATE')
        }


        simpleParser(raw, {}, async (err, data) => {
            if (err) {
                console.log("Error:", err)
                return callback(null, 'TRYCREATE')
            } else {
                const insertResult = await MailserverResolver(db).Mutation.createMailAccountMessage({
                    mailAccount: session.user.id,
                    mailAccountFolder: folder._id,
                    flags: flags ? flags.filter(f=>!!f): [],
                    data
                }, {context}, false)

                this.notifier.addEntries(
                    folder,
                    {
                        command: 'EXISTS',
                        uid: insertResult.uid
                    },
                    () => {
                        this.notifier.fire(session.user.id, folder)

                        return callback(null, true, {
                            uidValidity: folder.uidValidity,
                            uid: insertResult.uid
                        })
                    }
                )
            }
        })
    }

    // STORE / UID STORE, updates flags for selected UIDs
    server.onStore = async function (folderId, update, session, callback) {
        console.log('IMAP onStore', folderId, session.id, update)
        this.logger.debug('[%s] Updating messages in "%s"', session.id, folderId)

        const folder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        const messages = await getMessagesForFolderByUids(db,folder._id,update.messages)

        let condstoreEnabled = !!session.selected.condstoreEnabled

        let modified = []
        let i = 0

        let processMessages = () => {
            if (i >= messages.length) {
                this.notifier.fire(session.user.id, folder)
                return callback(null, true, modified)
            }

            let message = messages[i++]
            let updated = false
            if(!message.flags){
                message.flags = []
            }

            if (update.messages.indexOf(message.uid) < 0) {
                return processMessages()
            }

            if (update.unchangedSince && message.modseq > update.unchangedSince) {
                modified.push(message.uid)
                return processMessages()
            }

            switch (update.action) {
                case 'set':
                    // check if update set matches current or is different
                    if (message.flags.length !== update.value.length || update.value.filter(flag => message.flags.indexOf(flag) < 0).length) {
                        updated = true
                    }
                    // set flags
                    if(update.value) {
                        message.flags = [].concat(update.value)
                    }else{
                        message.flags = []
                    }
                    break

                case 'add':
                    message.flags = message.flags.concat(
                        update.value.filter(flag => {
                            if (message.flags.indexOf(flag) < 0) {
                                updated = true
                                return true
                            }
                            return false
                        })
                    )
                    break

                case 'remove':
                    message.flags = message.flags.filter(flag => {
                        if (update.value.indexOf(flag) < 0) {
                            return true
                        }
                        updated = true
                        return false
                    });
                    break
            }

            // notifiy only if something changed
            if (updated) {
                console.log('-----------imap update message', message)
                MailserverResolver(db).Mutation.updateMailAccountMessage({
                    _id:message._id,
                    flags: message.flags? message.flags.filter(f=>!!f): []
                }, {context}, {forceAdminContext:true}).then((data)=>{
                    message.modseq = data.modseq

                    // Only show response if not silent or modseq is required
                    if (!update.silent || condstoreEnabled) {
                        session.writeStream.write(
                            session.formatResponse('FETCH', message.uid, {
                                uid: update.isUid ? message.uid : false,
                                flags: update.silent ? false : message.flags,
                                modseq: condstoreEnabled ? message.modseq : false
                            })
                        )
                    }

                    this.notifier.addEntries(
                        folder,
                        {
                            command: 'FETCH',
                            ignore: session.id,
                            uid: message.uid,
                            flags: message.flags
                        },
                        processMessages
                    )
                }).catch(err=>{
                    console.warn('IMAP onStore', err)
                    callback(null, 'ERROR')
                })
            } else {
                processMessages()
            }
        }
        processMessages()
    }

    // EXPUNGE deletes all messages in selected mailbox marked with \Delete
    server.onExpunge = async function (folderId, update, session, callback) {
        console.log('IMAP onExpunge', folderId, session.id,update)
        this.logger.debug('[%s] Deleting messages from "%s"', session.id, folderId)

        const folder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        let messagesUidsToDelete
        if(update.isUid) {
            messagesUidsToDelete = update.messages
        }else{
            messagesUidsToDelete = await getMessageUidsForFolderId(db, folder._id, {flags: {$in:['\\Deleted']}})
        }

        const entries = []
        for (const messageUidToDelete of messagesUidsToDelete) {
            entries.push({
                command: 'EXPUNGE',
                ignore: session.id,
                uid: messageUidToDelete
            })
            if (!update.silent) {
                session.writeStream.write(session.formatResponse('EXPUNGE', messageUidToDelete))
            }
        }

        await deleteMessagesForFolderByUids(db, folder, messagesUidsToDelete)

        this.notifier.addEntries(folder, entries, () => {
            this.notifier.fire(session.user.id, folder)
            return callback(null, true)
        })
    }

    // COPY / UID COPY sequence mailbox
    server.onCopy = async function (connection, folderId, update, session, callback) {
        console.log('IMAP onCopy', folderId, session.id, update)
        this.logger.debug('[%s] Copying messages from "%s" to "%s"', session.id, folderId, update.destination);

        const sourceFolder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!sourceFolder) {
            return callback(null, 'NONEXISTENT')
        }

        const destinationFolder = await getFolderForMailAccount(db, session.user.id, update.destination)
        if (!destinationFolder) {
            return callback(null, 'TRYCREATE')
        }

        const sourceMessages = await getMessagesForFolderByUids(db,sourceFolder._id,update.messages,'ALL')

        let sourceUid = sourceMessages.map(f=>f.uid)
        let destinationUid = []
        let entries = []


        for (const sourceMessage of sourceMessages) {
            const destinationMessage = JSON.parse(JSON.stringify(sourceMessage))
            destinationMessage.mailAccountFolder = destinationFolder._id
            delete destinationMessage.uid
            delete destinationMessage.modseq
            //delete desitnationMessage.flags
            delete destinationMessage._id
            if(destinationMessage.flags){
                destinationMessage.flags = destinationMessage.flags.filter(f=>!!f)
            }


            const insertResult = await MailserverResolver(db).Mutation.createMailAccountMessage(destinationMessage, {context}, {skipCheck:true})

            destinationMessage.uid = insertResult.uid
            destinationUid.push(destinationMessage.uid)

            // do not write directly to stream, use notifications as the currently selected mailbox might not be the one that receives the message
            entries.push({
                command: 'EXISTS',
                uid: destinationMessage.uid
            })
        }

        this.notifier.addEntries(destinationFolder, entries, () => {
            this.notifier.fire(session.user.id, destinationFolder)

            return callback(null, true, {
                uidValidity: destinationFolder.uidValidity,
                sourceUid,
                destinationUid
            })
        })
    }

    // sends results to socket
    server.onFetch = async function (folderId, options, session, callback) {
        console.log('IMAP onFetch', folderId)
        this.logger.debug('[%s] Requested FETCH for "%s"', session.id, folderId);
        this.logger.debug('[%s] FETCH: %s', session.id, JSON.stringify(options.query));

        const folder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        let entries = []
        const messages = await getMessagesForFolder(db,folder._id)
        if (options.markAsSeen) {
            // mark all matching messages as seen
            messages.forEach(message => {
                if (options.messages.indexOf(message.uid) < 0) {
                    return
                }

                // if BODY[] is touched, then add \Seen flag and notify other clients
                if (!message.flags.includes('\\Seen')) {
                    message.flags.unshift('\\Seen')
                    entries.push({
                        command: 'FETCH',
                        ignore: session.id,
                        uid: message.uid,
                        flags: message.flags
                    })
                }
            })
        }

        this.notifier.addEntries(folder, entries,() => {
            let pos = 0;
            let processMessage = () => {
                if (pos >= messages.length) {
                    // once messages are processed show relevant updates
                    this.notifier.fire(session.user.id, folder)
                    return callback(null, true)
                }
                let message = messages[pos++]
                console.log(`imap process message with uid ${message.uid}`)

                if (options.messages.indexOf(message.uid) < 0) {
                    console.log(`imap skip ${message.uid}`)
                    return setImmediate(processMessage)
                }

                if (options.changedSince && message.modseq <= options.changedSince) {
                    console.log(`imap changedSince skip ${message.uid}`)
                    return setImmediate(processMessage)
                }
                const messageData = JSON.parse(JSON.stringify(message.data))
                delete message.data
                delete messageData.headerLines

                if(messageData.headers /*&& messageData.headers['content-transfer-encoding']==='quoted-printable'*/){
                    delete messageData.headers['content-transfer-encoding']
                    delete messageData.headers['content-type']
                }

                replaceAddresseObjectsToString(messageData)

                const mailComposer = new MailComposer(messageData)
                mailComposer.compile().build((err,mailMessage)=>{
                    let stream = imapHandler.compileStream(
                        session.formatResponse('FETCH', message.uid, {
                            query: options.query,
                            values: session.getQueryResponse(
                                options.query,
                                {...message,
                                    mimeTree:parseMimeTree(mailMessage),
                                    idate: new Date(messageData.date)
                                }
                            )
                        })
                    )
                    // send formatted response to socket
                    session.writeStream.write(stream, () => {
                        setImmediate(processMessage)
                    })
                })
            }
            setImmediate(processMessage)
        })
    }

    // returns an array of matching UID values and the highest modseq of matching messages
    server.onSearch = async function (mailbox, options, session, callback) {


        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT');
        }

        return callback(null, true)
       /* let highestModseq = 0;

        let uidList = [];
        let checked = 0;
        let checkNext = () => {
            if (checked >= folder.messages.length) {
                return callback(null, {
                    uidList,
                    highestModseq
                });
            }
            let message = folder.messages[checked++];
            session.matchSearchQuery(message, options.query, (err, match) => {
                if (err) {
                    // ignore
                }
                if (match && highestModseq < message.modseq) {
                    highestModseq = message.modseq;
                }
                if (match) {
                    uidList.push(message.uid);
                }
                checkNext();
            });
        };
        checkNext();*/
    }


    server.listen(993,()=>{
        console.log("IMAP Server Listening")
    })
}


const stopListening = () => {

}

export default {startListening, stopListening}