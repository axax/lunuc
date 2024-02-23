import Wildduck from 'wildduck/imap-core'
import parseMimeTree from 'wildduck/imap-core/lib/indexer/parse-mime-tree'
import imapHandler from 'wildduck/imap-core/lib/handler/imap-handler'
import {getHostRules, hostListFromString, getRootCertContext} from '../../../util/hostrules.mjs'
import {
    getMailAccountByEmail,
    getFoldersForMailAccount,
    getSubscribedFoldersForMailAccount,
    getFolderForMailAccount,
    getMessageIdsForFolderId, getMessagesForFolder
} from '../util/index.mjs'
import Util from '../../../api/util/index.mjs'
import MemoryNotifier from './MemoryNotifier.js'


let server
const startListening = async (db, context) => {


    // This example uses global folders and subscriptions
   /* let folders = new Map();
    let subscriptions = new WeakSet();
    [
        {
            mailbox: Symbol('INBOX'),
            path: 'INBOX',
            uidValidity: 123,
            uidNext: 70,
            modifyIndex: 5000,
            messages: [
                {
                    uid: 45,
                    flags: [],
                    modseq: 100,
                    idate: new Date('14-Sep-2013 21:22:28 -0300'),
                    mimeTree: parseMimeTree(
                        Buffer.from('from: sender@example.com\r\nto: to@example.com\r\ncc: cc@example.com\r\nsubject: test\r\n\r\nzzzz\r\n')
                    )
                },
               {
                    uid: 49,
                    flags: ['\\Seen'],
                    idate: new Date(),
                    modseq: 5000,
                    mimeTree: MIMEParser(fs.readFileSync(__dirname + '/fixtures/ryan_finnie_mime_torture.eml'))
                },
                {
                    uid: 50,
                    flags: ['\\Seen'],
                    modseq: 45,
                    idate: new Date(),
                    mimeTree: parseMimeTree(
                        'MIME-Version: 1.0\r\n' +
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
                        '------mailcomposer-?=_1-1328088797399--\r\n'
                    )
                },
                {
                    uid: 52,
                    flags: [],
                    modseq: 4,
                    idate: new Date(),
                    mimeTree: parseMimeTree('from: sender@example.com\r\nto: to@example.com\r\ncc: cc@example.com\r\nsubject: test\r\n\r\nHello World!\r\n')
                },
                {
                    uid: 53,
                    flags: [],
                    modseq: 5,
                    idate: new Date()
                },
                {
                    uid: 60,
                    flags: [],
                    modseq: 6,
                    idate: new Date()
                }
            ],
            journal: []
        },
        {
            mailbox: Symbol('[Gmail]/Sent Mail'),
            path: '[Gmail]/Sent Mail',
            specialUse: '\\Sent',
            uidValidity: 123,
            uidNext: 90,
            modifyIndex: 1,
            messages: [],
            journal: []
        }
    ].forEach(folder => {
        folders.set(folder.path, folder);
        subscriptions.add(folder);
    });*/

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
        this.logger.debug('[%s] LIST for "%s"', session.id, query);

        const mailAccountFolders = await getFoldersForMailAccount(db, session.user.id)

        console.log('IMAP onList', query, session.id, mailAccountFolders)

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
        /*this.logger.debug('[%s] SUBSCRIBE to "%s"', session.id, mailbox);

        if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        subscriptions.add(folders.get(mailbox));*/
        callback(null, true);
    };

    // UNSUBSCRIBE "path/to/mailbox"
    server.onUnsubscribe = function (mailbox, session, callback) {
        /*this.logger.debug('[%s] UNSUBSCRIBE from "%s"', session.id, mailbox);

        if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        subscriptions.delete(folders.get(mailbox));*/
        callback(null, true);
    };

    // CREATE "path/to/mailbox"
    server.onCreate = function (mailbox, session, callback) {
       /* this.logger.debug('[%s] CREATE "%s"', session.id, mailbox);

        if (folders.has(mailbox)) {
            return callback(null, 'ALREADYEXISTS');
        }

        folders.set(mailbox, {
            path: mailbox,
            uidValidity: Date.now(),
            uidNext: 1,
            modifyIndex: 0,
            messages: [],
            journal: []
        });

        subscriptions.add(folders.get(mailbox));*/
        callback(null, true);
    };

    // RENAME "path/to/mailbox" "new/path"
    // NB! RENAME affects child and hierarchy mailboxes as well, this example does not do this
    server.onRename = function (mailbox, newname, session, callback) {
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
        console.log('onOpen', mailbox)
        this.logger.debug('[%s] Opening "%s"', session.id, mailbox);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT');
        }

        const msgIds = await getMessageIdsForFolderId(db,folder._id)

        return callback(null, {...folder,_id:folder.path,uidList:msgIds}) /* {
            specialUse: folder.specialUse,
            uidValidity: folder.uidValidity,
            uidNext: folder.uidNext,
            modifyIndex: folder.modifyIndex,
            _id: 'INBOX',
            uidList: folder.messages.map(message => message.uid)
        }*/
    };

    // STATUS (X Y X)
    server.onStatus = async function (mailbox, session, callback) {
        this.logger.debug('[%s] Requested status for "%s"', session.id, mailbox)

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        return callback(null, folder); /* {
            messages: folder.messages.length,
            uidNext: folder.uidNext,
            uidValidity: folder.uidValidity,
            highestModseq: folder.modifyIndex,
            unseen: folder.messages.filter(message => !message.flags.includes('\\Seen')).length
        }*/
    };

    // APPEND mailbox (flags) date message
    server.onAppend = async function (mailbox, flags, date, raw, session, callback) {
        this.logger.debug('[%s] Appending message to "%s"', session.id, mailbox);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'TRYCREATE');
        }

        date = (date && new Date(date)) || new Date();
        return callback(null, true)
        /*let message = {
            uid: folder.uidNext++,
            modseq: ++folder.modifyIndex,
            date: (date && new Date(date)) || new Date(),
            mimeTree: parseMimeTree(raw),
            flags
        };

        folder.messages.push(message);*/

        // do not write directly to stream, use notifications as the currently selected mailbox might not be the one that receives the message
        /*this.notifier.addEntries(
            session.user.id,
            mailbox,
            {
                command: 'EXISTS',
                uid: message.uid
            },
            () => {
                this.notifier.fire(session.user.id, mailbox);

                return callback(null, true, {
                    uidValidity: folder.uidValidity,
                    uid: message.uid
                });
            }
        );*/
    };

    // STORE / UID STORE, updates flags for selected UIDs
    server.onStore = async function (mailbox, update, session, callback) {
        this.logger.debug('[%s] Updating messages in "%s"', session.id, mailbox)

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }
        return callback(null, true)
        /*let condstoreEnabled = !!session.selected.condstoreEnabled

        let modified = [];
        let i = 0;

        let processMessages = () => {
            if (i >= folder.messages.length) {
                this.notifier.fire(session.user.id, mailbox);
                return callback(null, true, modified);
            }

            let message = folder.messages[i++];
            let updated = false;

            if (update.messages.indexOf(message.uid) < 0) {
                return processMessages();
            }

            if (update.unchangedSince && message.modseq > update.unchangedSince) {
                modified.push(message.uid);
                return processMessages();
            }

            switch (update.action) {
                case 'set':
                    // check if update set matches current or is different
                    if (message.flags.length !== update.value.length || update.value.filter(flag => message.flags.indexOf(flag) < 0).length) {
                        updated = true;
                    }
                    // set flags
                    message.flags = [].concat(update.value);
                    break;

                case 'add':
                    message.flags = message.flags.concat(
                        update.value.filter(flag => {
                            if (message.flags.indexOf(flag) < 0) {
                                updated = true;
                                return true;
                            }
                            return false;
                        })
                    );
                    break;

                case 'remove':
                    message.flags = message.flags.filter(flag => {
                        if (update.value.indexOf(flag) < 0) {
                            return true;
                        }
                        updated = true;
                        return false;
                    });
                    break;
            }

            // notifiy only if something changed
            if (updated) {
                message.modseq = ++folder.modifyIndex;

                // Only show response if not silent or modseq is required
                if (!update.silent || condstoreEnabled) {
                    session.writeStream.write(
                        session.formatResponse('FETCH', message.uid, {
                            uid: update.isUid ? message.uid : false,
                            flags: update.silent ? false : message.flags,
                            modseq: condstoreEnabled ? message.modseq : false
                        })
                    );
                }

                this.notifier.addEntries(
                    session.user.id,
                    mailbox,
                    {
                        command: 'FETCH',
                        ignore: session.id,
                        uid: message.uid,
                        flags: message.flags
                    },
                    processMessages
                );
            } else {
                processMessages();
            }
        };

        processMessages();*/
    };

    // EXPUNGE deletes all messages in selected mailbox marked with \Delete
    server.onExpunge = async function (mailbox, update, session, callback) {
        this.logger.debug('[%s] Deleting messages from "%s"', session.id, mailbox)

        console.log('onExpunge', mailbox)

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }
        return callback(null, true)
        /*let deleted = [];
        let i, len;

        for (i = folder.messages.length - 1; i >= 0; i--) {
            if (
                ((update.isUid && update.messages.indexOf(folder.messages[i].uid) >= 0) || !update.isUid) &&
                folder.messages[i].flags.indexOf('\\Deleted') >= 0
            ) {
                deleted.unshift(folder.messages[i].uid);
                folder.messages.splice(i, 1);
            }
        }

        let entries = [];
        for (i = 0, len = deleted.length; i < len; i++) {
            entries.push({
                command: 'EXPUNGE',
                ignore: session.id,
                uid: deleted[i]
            });
            if (!update.silent) {
                session.writeStream.write(session.formatResponse('EXPUNGE', deleted[i]));
            }
        }

        this.notifier.addEntries(session.user.id, mailbox, entries, () => {
            this.notifier.fire(session.user.id, mailbox);
            return callback(null, true);
        });*/
    };

    // COPY / UID COPY sequence mailbox
    server.onCopy = async function (connection, mailbox, update, session, callback) {
        this.logger.debug('[%s] Copying messages from "%s" to "%s"', session.id, mailbox, update.destination);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        const folderDestination = await getFolderForMailAccount(db, session.user.id, update.destination)

        if (!folderDestination) {
            return callback(null, 'TRYCREATE')
        }

        return callback(null, true)
      /*  let sourceFolder = folders.get(mailbox);
        let destinationFolder = folders.get(update.destination);

        let messages = [];
        let sourceUid = [];
        let destinationUid = [];
        let i, len;
        let entries = [];

        for (i = sourceFolder.messages.length - 1; i >= 0; i--) {
            if (update.messages.indexOf(sourceFolder.messages[i].uid) >= 0) {
                messages.unshift(JSON.parse(JSON.stringify(sourceFolder.messages[i])));
                sourceUid.unshift(sourceFolder.messages[i].uid);
            }
        }

        for (i = 0, len = messages.length; i < len; i++) {
            messages[i].uid = destinationFolder.uidNext++;
            destinationUid.push(messages[i].uid);
            destinationFolder.messages.push(messages[i]);

            // do not write directly to stream, use notifications as the currently selected mailbox might not be the one that receives the message
            entries.push({
                command: 'EXISTS',
                uid: messages[i].uid
            });
        }

        this.notifier.addEntries(update.destination, session.user.id, entries, () => {
            this.notifier.fire(session.user.id, update.destination);

            return callback(null, true, {
                uidValidity: destinationFolder.uidValidity,
                sourceUid,
                destinationUid
            });
        });*/
    }

    // sends results to socket
    server.onFetch = async function (mailbox, options, session, callback) {
        this.logger.debug('[%s] Requested FETCH for "%s"', session.id, mailbox);
        this.logger.debug('[%s] FETCH: %s', session.id, JSON.stringify(options.query));

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }
        return callback(null, 'NONEXISTENT')

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
                    message.flags.unshift('\\Seen');
                    entries.push({
                        command: 'FETCH',
                        ignore: session.id,
                        uid: message.uid,
                        flags: message.flags
                    })
                }
            })
        }

        this.notifier.addEntries(mailbox, entries,{},  () => {
            let pos = 0;
            let processMessage = () => {
                if (pos >= messages.length) {
                    // once messages are processed show relevant updates
                    this.notifier.fire(session.user.id, mailbox)
                    return callback(null, true)
                }
                let message = messages[pos++]

                if (options.messages.indexOf(message.uid) < 0) {
                    return setImmediate(processMessage)
                }

                if (options.changedSince && message.modseq <= options.changedSince) {
                    return setImmediate(processMessage)
                }

                let stream = imapHandler.compileStream(
                    session.formatResponse('FETCH', message.uid, {
                        query: options.query,
                        values: session.getQueryResponse(
                            options.query,
                            {...message, idate: new Date(message.date)}
                        )
                    })
                );

                // send formatted response to socket
                session.writeStream.write(stream, () => {
                    setImmediate(processMessage)
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