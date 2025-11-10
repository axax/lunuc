import Wildduck from 'wildduck/imap-core'
import parseMimeTree from 'wildduck/imap-core/lib/indexer/parse-mime-tree'
import imapHandler from 'wildduck/imap-core/lib/handler/imap-handler'
import {
    getRootCertContext,
    getBestMatchingHostRule
} from '../../../util/hostrules.mjs'
import {
    getMailAccountByEmail,
    getFoldersForMailAccount,
    getSubscribedFoldersForMailAccount,
    getFolderForMailAccount,
    getMessageUidsForFolderId,
    getMessagesForFolder,
    getFolderForMailAccountById,
    deleteMessagesForFolderByUids
} from '../util/dbhelper.mjs'
import {getCircularReplacer, replaceAddresseObjectsToString} from '../util/index.mjs'
import Util from '../../../api/util/index.mjs'
import MemoryNotifier from './MemoryNotifier.js'
import MailComposer from 'nodemailer/lib/mail-composer'
import MailserverResolver from '../gensrc/resolver.mjs'
import {simpleParser} from 'mailparser'
import {createDefaultLogger} from './logger.mjs'
import {dynamicSettings} from '../../../api/util/settings.mjs'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Hook from '../../../util/hook.cjs'

// open port 993 on your server
// sudo ufw allow 993


function headerLinesToMimeTreeHeaders(headerLines) {
    const headers = {};
    for (const { key, line } of headerLines) {
        // Extract the value after the first colon and optional whitespace
        const idx = line.indexOf(':');
        if (idx !== -1) {
            const name = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).replace(/^\s+/, ''); // Remove leading whitespace
            headers[name] = value;
        }
    }
    return headers;
}

function convertSimpleParserToMimeTree(parsed) {
    const root = {
        headers: headerLinesToMimeTreeHeaders(parsed.headerLines),
        parsedHeader: parsed.headers,
        children: []
    };

    // Handle multipart/alternative for text and html
    if (parsed.text && parsed.html) {
        const altNode = {
            headers: { 'Content-Type': 'multipart/alternative' },
            children: [
                { headers: { 'Content-Type': 'text/plain' }, content: parsed.text },
                { headers: { 'Content-Type': 'text/html' }, content: parsed.html }
            ]
        };
        root.children.push(altNode);
    } else if (parsed.text) {
        root.children.push({ headers: { 'Content-Type': 'text/plain' }, content: parsed.text });
    } else if (parsed.html) {
        root.children.push({ headers: { 'Content-Type': 'text/html' }, content: parsed.html });
    }

    // Add attachments
    if (parsed.attachments) {
        for (const att of parsed.attachments) {
            root.children.push({
                headers: {
                    'Content-Type': att.contentType,
                    'Content-Disposition': att.contentDisposition || 'attachment',
                    'Content-Transfer-Encoding': att.transferEncoding || 'base64',
                    'Filename': att.filename
                },
                parsedHeader: att.headers,
                content: att.content // Buffer
            });
        }
    }

    return root;
}

const mongoDbMatchProjectFromIMapData = (options) => {
    let match = {}, project
    if (options.changedSince) {
        match.modseq = {$gt: options.changedSince}
    }
    if (options.messages) {
        match.uid = {$in: options.messages}
    }
    if (options.metadataOnly && options.query) {
        // [{"query":"FLAGS","item":"flags","original":{"type":"ATOM","value":"FLAGS"}},{"query":"UID","item":"uid","original":{"type":"ATOM","value":"UID"}},{"query":"MODSEQ","item":"modseq","original":{"type":"ATOM","value":"MODSEQ"}}]
        project = {_id: 1}
        options.query.forEach(q => {
            project[q.item] = 1
        })
    }
    return {match, project}
}
const startListening = async (db, context) => {

    const settings = {}
    let server

    await dynamicSettings({db, context, settings, key:'IMAPServerSettings'})


    // Setup server
    server = server = new Wildduck.IMAPServer({
        secure:true,
        name: 'Lunuc IMAP Server',
        version: '1.0.0',
        vendor: 'lunuc.com',
        host: '0.0.0.0',
        port: 993,
        logger:createDefaultLogger(settings),
        markAsSeen:true,
        ignoreSTARTTLS:true,
        /*secured: false,
        disableSTARTTLS: true,
        ignoreSTARTTLS: true,
        useProxy: false,*/
        ignoredHosts: [],
        maxMessage: 25 * 1024 * 1024,
        enableCompression: !!settings.enableCompression,
        SNICallback: (domain, cb) => {
            console.log('IMAP SNICallback',domain)

            const {hostrule, host} = getBestMatchingHostRule(domain)

            if(hostrule && hostrule.certContext){
                console.log(`imap server certContext for ${host}`)

                cb(null, hostrule.certContext)
            }else{
                cb(null,getRootCertContext())
            }

        }
    })

    const logger = {
        info: (...args) => {server.logger.info(null,...args)},
        debug: (...args) => {server.logger.debug(null,...args)},
        error: (...args) => {server.logger.error(null,...args)}
    }

    server.notifier = new MemoryNotifier({
        logger
    })

    server.on('error', err => {
        console.error('SERVER ERR\n%s', err.stack); // eslint-disable-line no-console
    });

    server.onAuth = async function (login, session, callback) {

        logger.debug('IMAP onAuth %s', login.username)

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
        logger.debug('[%s] LIST for "%s"', session.id, query);

        const mailAccountFolders = await getFoldersForMailAccount(db, session.user.id)

        callback(null, mailAccountFolders)
    };

    // LSUB "" "*"
    // Returns all subscribed folders, query is informational
    // folders is either an Array or a Map
    server.onLsub = async function (query, session, callback) {
        logger.debug('[%s] LSUB for "%s"', session.id, query);

        const subscribedFolders = await getSubscribedFoldersForMailAccount(db, session.user.id)

        callback(null, subscribedFolders);
    };

    // SUBSCRIBE "path/to/mailbox"
    server.onSubscribe = function (mailbox, session, callback) {
        logger.debug('[%s] SUBSCRIBE to "%s"', session.id, mailbox)
      /*  if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        subscriptions.add(folders.get(mailbox));*/
        callback(null, true);
    };

    // UNSUBSCRIBE "path/to/mailbox"
    server.onUnsubscribe = function (mailbox, session, callback) {
        logger.debug('[%s] UNSUBSCRIBE from "%s"', session.id, mailbox);

        /*if (!folders.has(mailbox)) {
            return callback(null, 'NONEXISTENT');
        }

        subscriptions.delete(folders.get(mailbox));*/
        callback(null, true);
    };

    // CREATE "path/to/mailbox"
    server.onCreate = async function (mailbox, session, callback) {
        logger.debug('[%s] CREATE "%s"', session.id, mailbox)

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
        logger.debug('[%s] RENAME "%s" to "%s"', session.id, mailbox, newname);

        /*if (!folders.has(mailbox)) {
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
        logger.debug('[%s] DELETE "%s"', session.id, mailbox);

        /*if (!folders.has(mailbox)) {
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
        logger.debug('[%s] Opening "%s"', session.id, mailbox);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT');
        }

        folder.uidList = await getMessageUidsForFolderId(db,folder._id)

        return callback(null, folder)
    }

    // STATUS (X Y X)
    server.onStatus = async function (folderId, session, callback) {
        logger.debug('[%s] Requested status for "%s"', session.id, folderId)

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
        logger.debug('[%s] Appending message to "%s"', session.id, mailbox);

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'TRYCREATE')
        }


        await simpleParser(raw, {}, async (err, data) => {
            if (err) {
                console.error("IMAP parser error:", err)
                return callback(null, 'TRYCREATE')
            } else {
                const insertResult = await MailserverResolver(db).Mutation.createMailAccountMessage({
                    mailAccount: session.user.id,
                    mailAccountFolder: folder._id,
                    flags: flags ? flags.filter(f=>!!f): [],
                    data
                }, {context}, false)

                this.notifier.addEntries(
                    session,
                    folder,
                    {
                        command: 'EXISTS',
                        uid: insertResult.uid
                    },
                    () => {
                        this.notifier.fire(session.user.id, null)

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
        logger.debug('[%s] Updating messages in "%s"', session.id, folderId)

        const folder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        const messages = await getMessagesForFolder(db,folder._id,{uid: { $in: update.messages }}, { uid: 1, flags: 1, modseq: 1, _id:1})

        let condstoreEnabled = !!session.selected.condstoreEnabled

        let modified = []
        let i = 0

        let processMessages = () => {
            if (i >= messages.length) {
                this.notifier.fire(session.user.id, null)
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
                message.flags = message.flags? message.flags.filter(f=>!!f): []
                MailserverResolver(db).Mutation.updateMailAccountMessage({
                    _id:message._id,
                    flags: message.flags
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
                        session,
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
        logger.debug('[%s] Deleting messages from "%s"', session.id, folderId)

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

        this.notifier.addEntries(session,folder, entries, () => {
            this.notifier.fire(session.user.id, null)
            return callback(null, true)
        })
    }

    // COPY / UID COPY sequence mailbox
    server.onCopy = async function (connection, folderId, update, session, callback) {
        logger.debug('[%s] Copying messages from "%s" to "%s"', session.id, folderId, update.destination);

        const sourceFolder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!sourceFolder) {
            return callback(null, 'NONEXISTENT')
        }

        const destinationFolder = await getFolderForMailAccount(db, session.user.id, update.destination)
        if (!destinationFolder) {
            return callback(null, 'TRYCREATE')
        }

        const sourceMessages = await getMessagesForFolder(db,sourceFolder._id,{uid: { $in: update.messages }})

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

        this.notifier.addEntries(session,destinationFolder, entries, () => {
            this.notifier.fire(session.user.id, null)

            return callback(null, true, {
                uidValidity: destinationFolder.uidValidity,
                sourceUid,
                destinationUid
            })
        })
    }

    // sends results to socket
    server.onFetch = async function (folderId, options, session, callback) {
        logger.debug('[%s] Requested FETCH for "%s"', session.id, folderId);
        logger.debug('[%s] FETCH: %s', session.id, JSON.stringify(options.query));

        const folder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        let entries = []
        const {match, project} = mongoDbMatchProjectFromIMapData(options)
        const messages = await getMessagesForFolder(db,folder._id,match, project)

        console.log(`imap ${messages.length} found`, match)

        let messageData
        const logError = (message) => {
            GenericResolver.createEntity(db, {context: context}, 'Log', {
                location: 'mailserver',
                type: 'imapError',
                message: message,
                meta: {
                    messageData,
                    debug: JSON.parse(JSON.stringify({folderId, options, session}, getCircularReplacer()))
                }
            })
        }

        session.writeStream.on('error', (err) => {
            logError(err.message)
        })


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

        this.notifier.addEntries(session,folder, entries,() => {
            let pos = 0;
            let processMessage = () => {
                if (pos >= messages.length) {
                    // once messages are processed show relevant updates
                    this.notifier.fire(session.user.id, null)
                    return callback(null, true)
                }
                let message = messages[pos++]
                logger.debug('[%s] imap process message with uid "%s"', session.id, message.uid)


                if (options.messages.indexOf(message.uid) < 0) {
                    logger.debug('[%s] imap skip message with uid "%s"', session.id, message.uid)
                    return setImmediate(processMessage)
                }

                if (options.changedSince && message.modseq <= options.changedSince) {
                    logger.debug('[%s] imap changedSince skip message with uid "%s"', session.id, message.uid)
                    return setImmediate(processMessage)
                }

                if(message.data) {

                    /*

                        const mimeTree = convertSimpleParserToMimeTree(message.data)
                        const idate = new Date(message.data.date)
                        delete message.data
                     */


                    // Extract fields from parsed email
                    messageData = {
                        from: message.data.from?.text,            // 'From' header
                        sender: message.data.sender?.text,        // 'Sender' header
                        to: message.data.to?.text,                // 'To' header
                        replyTo: message.data.replyTo?.text,      // 'Reply-To' header
                        inReplyTo: message.data.inReplyTo,        // 'In-Reply-To' header
                        references: message.data.references,      // 'References' header
                        messageId: message.data.messageId,        // Custom Message-ID header
                        cc: message.data.cc?.text,
                        bcc: message.data.bcc?.text,
                        subject: message.data.subject,
                        text: message.data.text,
                        html: message.data.html,
                        date: message.data.date, // important for preserving sent date
                       // alternatives: message.data.alternatives,
                        attachments: message.data.attachments.map(att => ({
                            filename: att.filename,
                            content: att.content,
                            contentType: att.contentType,
                            cid: att.cid,
                            contentDisposition: att.contentDisposition,
                        })),
                    }


                   /* messageData = JSON.parse(JSON.stringify(message.data))

                    delete message.data
                    delete messageData.headerLines

                    if (messageData.headers) {
                        delete messageData.headers['content-transfer-encoding']

                        if(settings.resetBodyContentType) {
                            delete messageData.headers['content-type']

                            if (messageData.html) {
                                messageData.headers['content-type'] = 'text/html; charset=utf-8'
                            }
                        }
                    }

                    if (Array.isArray(messageData.attachments)) {
                        messageData.attachments.forEach(attachment => {
                            if (attachment.encoding === 'quoted-printable') {
                                delete attachment.encoding
                            }
                            if (attachment?.headers['content-transfer-encoding'] === 'quoted-printable') {
                                delete attachment.headers['content-transfer-encoding']
                            }
                        })
                    }

                    replaceAddresseObjectsToString(messageData)*/

                    try {
                        /*const mailComposer = new MailComposer({
                            headers: messageData.headers,
                            text: messageData.text,
                            html: messageData.html,
                            attachments: messageData.attachments
                        })*/
                        const mailComposer = new MailComposer(messageData)

                        mailComposer.compile().build((err, mailMessage) => {

                            Hook.call('imapOnFetchMailComposed', {messageData, mailMessage, folderId, options, session})

                            let stream = imapHandler.compileStream(
                                session.formatResponse('FETCH', message.uid, {
                                    query: options.query,
                                    values: session.getQueryResponse(
                                        options.query,
                                        {
                                            ...message,
                                            mimeTree: parseMimeTree(mailMessage),
                                            idate: new Date(messageData.date)
                                        }
                                    )
                                })
                            )
                            if (stream && session?.socket?.writable && !session?.socket?.destroyed) {

                                stream.on('error', (err) => {
                                    logError(err.message)
                                })

                                session.writeStream.write(stream, () => {
                                    setImmediate(processMessage)
                                })
                           /* } else {
                                logError(`stream is null or closed`)*/
                            }
                        })
                    } catch (error) {
                        logError(error.message)
                        console.error('error building email', error)
                        setImmediate(processMessage)
                    }
                }else{
                    const stream = imapHandler.compileStream(
                        session.formatResponse('FETCH', message.uid, {
                            query: options.query,
                            values: session.getQueryResponse(
                                options.query,
                                {
                                    ...message
                                }
                            )
                        })
                    )

                    stream.on('error', (err) => {
                        logError(err.message)
                    })
                    session.writeStream.write(stream, () => {
                        setImmediate(processMessage)
                    })
                }
            }
            setImmediate(processMessage)
        })
    }

    // returns an array of matching UID values and the highest modseq of matching messages
    server.onSearch = async function (folderId, options, session, callback) {
        logger.debug('[%s] imap search folder %s with query "%s"', session.id, folderId, JSON.stringify(options.query))

        const folder = await getFolderForMailAccountById(db, session.user.id, folderId)

        if (!folder) {
            logger.debug('[%s] folder with id %s NONEXISTENT', session.id, folderId)
            return callback(null, 'NONEXISTENT');
        }

        console.log('imap search', options)
        const {match, project} = mongoDbMatchProjectFromIMapData(options)
        const messages = await getMessagesForFolder(db,folder._id,match, project)


        logger.debug('[%s] folder %s number of messages found %s', session.id, folder.path, messages.length)

        let highestModseq = 0

        let uidList = []
        let checked = 0
        let checkNext = () => {
            if (checked >= messages.length) {
                return callback(null, {
                    uidList,
                    highestModseq
                });
            }
            let message = messages[checked++];
            session.matchSearchQuery(message, options.query, (err, match) => {
                if (err) {
                    console.error('IMAP Search', err, folder)
                    // ignore
                }
                if (match && highestModseq < message.modseq) {
                    highestModseq = message.modseq
                }
                if (match) {
                    uidList.push(message.uid)
                }
                checkNext()
            })
        }
        checkNext()
    }


    server.listen(993,()=>{
        console.log("IMAP Server Listening")
    })
}


const stopListening = () => {

}

export default {startListening, stopListening}