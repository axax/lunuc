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
    deleteMessagesForFolderByUids, getAttachmentContentFromFile
} from '../util/dbhelper.mjs'
import {getCircularReplacer} from '../util/index.mjs'
import ApiUtil from '../../../api/util/index.mjs'
import MemoryNotifier from './MemoryNotifier.js'
import MailComposer from 'nodemailer/lib/mail-composer'
import MailserverResolver from '../gensrc/resolver.mjs'
import {simpleParser} from 'mailparser'
import {createDefaultLogger} from './logger.mjs'
import {dynamicSettings} from '../../../api/util/settings.mjs'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Hook from '../../../util/hook.cjs'
import Util from '../../../client/util/index.mjs'
import Cache from '../../../util/cache.mjs'

// open port 993 on your server
// sudo ufw allow 993


// prefix for cached mime trees, so they can be cleared selectively via Cache.clearStartWith
const MIME_TREE_CACHE_PREFIX = 'imapMimeTree_'

// clients fetch structure and body parts in separate calls, sometimes minutes apart,
// so the composed message has to stay available long enough to cover all of them
const MIME_TREE_CACHE_TTL = 60 * 60 * 1000

// large messages are usually fetched in one go and would bloat the heap
const MIME_TREE_CACHE_MAX_SIZE = 10 * 1024 * 1024


/*
 getAttachmentContentFromFile may return a BSON Binary (mongodb driver), a Buffer,
 a string or a serialized buffer object. MailComposer only accepts strings, Buffers
 or streams, everything else fails with "chunk argument must be of type string or
 an instance of Buffer" as soon as nodemailer writes it to the stream.
 */
function normalizeAttachmentContent(content) {
    if (content === null || content === undefined) {
        return content
    }
    if (typeof content === 'string' || Buffer.isBuffer(content)) {
        return content
    }
    // BSON Binary exposes the raw bytes via value(true)
    if (typeof content.value === 'function') {
        return Buffer.from(content.value(true))
    }
    // BSON Binary of older drivers and similar wrappers keep the bytes in .buffer
    if (content.buffer) {
        return Buffer.from(content.buffer)
    }
    // serialized buffer: {type:'Buffer', data:[...]}
    if (content.type === 'Buffer' && Array.isArray(content.data)) {
        return Buffer.from(content.data)
    }
    if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
        return Buffer.from(content)
    }
    return content
}

// search terms that can be answered from the stored fields alone,
// without composing the message and building a mime tree.
// uid and modseq are deliberately excluded: their values can be imap
// sequence sets (1:*, 100:200, 4,7,9:12) and are left to matchSearchQuery
const LOCAL_SEARCH_KEYS = new Set([
    'all', 'uid',
    'seen', 'unseen', 'answered', 'unanswered', 'flagged', 'unflagged',
    'deleted', 'undeleted', 'draft', 'undraft', 'recent', 'new', 'old',
    'subject', 'from', 'to', 'cc', 'bcc', 'header',
    'since', 'before', 'senton', 'on', 'sentsince', 'sentbefore',
    'or', 'not'
])

// header names that are stored as dedicated fields by simpleParser
const HEADER_FIELD_MAP = {
    'message-id': 'messageId',
    'in-reply-to': 'inReplyTo',
    'references': 'references',
    'subject': 'subject',
    'date': 'date'
}

function canMatchLocally(query) {
    if (!Array.isArray(query)) {
        return false
    }
    return query.every(term => {
        const key = (term.key || '').toLowerCase()
        if (!LOCAL_SEARCH_KEYS.has(key)) {
            return false
        }
        if (key === 'or' || key === 'not') {
            const nested = Array.isArray(term.value) ? term.value : []
            return nested.every(sub => canMatchLocally(Array.isArray(sub) ? sub : [sub]))
        }
        if (key === 'uid') {
            // imap-core resolves sequence sets into a flat array before they get here.
            // anything else is left to matchSearchQuery
            return Array.isArray(term.value)
        }
        return true
    })
}

// address fields are stored as {text, value:[...]}, plain fields as strings
function fieldToText(value) {
    if (!value) {
        return ''
    }
    if (typeof value === 'string') {
        return value
    }
    if (value.text) {
        return value.text
    }
    if (Array.isArray(value)) {
        return value.join(' ')
    }
    return ''
}

function getHeaderText(data, name) {
    if (!data) {
        return ''
    }
    const lower = (name || '').toLowerCase()
    const mapped = HEADER_FIELD_MAP[lower]
    if (mapped && data[mapped]) {
        return fieldToText(data[mapped])
    }
    if (['from', 'to', 'cc', 'bcc', 'reply-to', 'sender'].includes(lower)) {
        const key = lower === 'reply-to' ? 'replyTo' : lower
        return fieldToText(data[key])
    }
    if (data.headers) {
        // stored headers may be a plain object or a Map
        if (typeof data.headers.get === 'function') {
            return fieldToText(data.headers.get(lower))
        }
        return fieldToText(data.headers[lower] || data.headers[name])
    }
    return ''
}

function contains(haystack, needle) {
    if (needle === undefined || needle === null || needle === '') {
        return true
    }
    return String(haystack || '').toLowerCase().indexOf(String(needle).toLowerCase()) >= 0
}

/*
 matches a message against a search query using the stored fields only.
 getIdate is a lazy getter: flag and header searches never need the date,
 so it is not built for every message of the folder up front.
 */
function matchLocally(message, query, getIdate) {
    const flags = message.flags || []
    const data = message.data || {}

    return query.every(term => {
        const key = (term.key || '').toLowerCase()
        const value = term.value

        switch (key) {
            case 'all':
                return true
            case 'uid':
                return value.includes(message.uid)

            case 'seen':      return flags.includes('\\Seen')
            case 'unseen':    return !flags.includes('\\Seen')
            case 'answered':  return flags.includes('\\Answered')
            case 'unanswered':return !flags.includes('\\Answered')
            case 'flagged':   return flags.includes('\\Flagged')
            case 'unflagged': return !flags.includes('\\Flagged')
            case 'deleted':   return flags.includes('\\Deleted')
            case 'undeleted': return !flags.includes('\\Deleted')
            case 'draft':     return flags.includes('\\Draft')
            case 'undraft':   return !flags.includes('\\Draft')
            case 'recent':    return false
            case 'new':       return false
            case 'old':       return true

            case 'subject':   return contains(data.subject, value)
            case 'from':      return contains(fieldToText(data.from), value)
            case 'to':        return contains(fieldToText(data.to), value)
            case 'cc':        return contains(fieldToText(data.cc), value)
            case 'bcc':       return contains(fieldToText(data.bcc), value)
            case 'header':    return contains(getHeaderText(data, term.header), value)

            case 'since':
            case 'sentsince':
                return getIdate() >= new Date(value)
            case 'before':
            case 'sentbefore':
                return getIdate() < new Date(value)
            case 'on':
            case 'senton': {
                const d = new Date(value)
                return getIdate().toDateString() === d.toDateString()
            }

            case 'or': {
                const branches = Array.isArray(value) ? value : []
                return branches.some(sub =>
                    matchLocally(message, Array.isArray(sub) ? sub : [sub], getIdate))
            }
            case 'not': {
                const branches = Array.isArray(value) ? value : []
                return !branches.some(sub =>
                    matchLocally(message, Array.isArray(sub) ? sub : [sub], getIdate))
            }

            default:
                return false
        }
    })
}

function buildMessageData(db, message) {
    const messageData = {
        from: message.data.from?.text,
        sender: message.data.sender?.text,
        to: message.data.to?.text,
        replyTo: message.data.replyTo?.text,
        inReplyTo: message.data.inReplyTo,
        references: message.data.references,
        messageId: message.data.messageId,
        cc: message.data.cc?.text,
        bcc: message.data.bcc?.text,
        subject: message.data.subject,
        text: message.data.text,
        html: message.data.html,
        date: new Date(message.data.date || Util.dateFromObjectId(message._id.toString(), new Date())).toUTCString(),
        attachments: Array.isArray(message.data.attachments) ? message.data.attachments.map(att => {
            const attachmentContent = normalizeAttachmentContent(getAttachmentContentFromFile(att, {db, message}))
            return {
                filename: att.filename,
                content: attachmentContent,
                contentType: att.contentType,
                cid: att.cid,
                // encoding describes how a given content string is encoded,
                // a Buffer already holds the decoded bytes
                encoding: Buffer.isBuffer(attachmentContent)
                    ? undefined
                    : (att.encoding !== 'quoted-printable' ? att.encoding : undefined),
                contentDisposition: att.contentDisposition,
            }
        }) : [],
    }

    if (message.data.headers) {
        ['x-spam-reason', 'x-spam-score'].forEach(headerKey => {
            if (message.data.headers[headerKey]) {
                if (!messageData.headers) {
                    messageData.headers = {}
                }
                messageData.headers[headerKey.toLowerCase()] = message.data.headers[headerKey]
            }
        })
    }

    if (messageData.date === 'Invalid Date') {
        messageData.date = new Date().toUTCString()
    }

    return messageData
}

/*
 composes the raw message and caches it, so fetch and search always operate on the
 identical byte stream and the same mime boundaries.
 the cache key must not contain modseq: the mime boundaries generated by MailComposer
 are random, and a flag change (e.g. \Seen on open) between the BODYSTRUCTURE fetch and
 the following BODY[..] fetch would otherwise hand the client two different messages.
 messageData is only returned when the message was actually composed, on a cache hit
 it is null.
 */
function composeMessage(db, message, logger, sessionId) {
    return new Promise((resolve, reject) => {
        const cacheKey = `${MIME_TREE_CACHE_PREFIX}${message._id}`
        const cached = Cache.get(cacheKey)
        if (cached) {
            return resolve({raw: cached, messageData: null})
        }

        let messageData
        try {
            messageData = buildMessageData(db, message)
        } catch (err) {
            return reject(err)
        }

        const composerInput = {
            ...messageData,
            // shallow clone instead of a JSON roundtrip, so attachment buffers
            // are not serialized into {type:'Buffer',data:[...]} objects
            attachments: messageData.attachments.map(att => ({...att}))
        }

        try {
            new MailComposer(composerInput).compile().build((err, builtMailMessage) => {
                if (err) {
                    return reject(err)
                }
                if (builtMailMessage.length <= MIME_TREE_CACHE_MAX_SIZE) {
                    Cache.set(cacheKey, builtMailMessage, MIME_TREE_CACHE_TTL)
                } else if (logger) {
                    logger.debug('[%s] message with uid "%s" too large to cache (%s bytes)', sessionId, message.uid, builtMailMessage.length)
                }
                resolve({raw: builtMailMessage, messageData})
            })
        } catch (err) {
            reject(err)
        }
    })
}

const mongoDbMatchProjectFromIMapData = (options) => {
    let match = {}, project
    if (options.changedSince) {
        match.modseq = {$gt: options.changedSince}
    }
    if (options.messages) {
        match.uid = {$in: options.messages}
    }
    if ( options.query ) {
        // [{"query":"FLAGS","item":"flags","original":{"type":"ATOM","value":"FLAGS"}},{"query":"UID","item":"uid","original":{"type":"ATOM","value":"UID"}},{"query":"MODSEQ","item":"modseq","original":{"type":"ATOM","value":"MODSEQ"}}]
        // [{"query":"UID","item":"uid","original":{"type":"ATOM","value":"UID"}},{"query":"RFC822.SIZE","item":"rfc822.size","original":{"type":"ATOM","value":"RFC822.SIZE"}},{"query":"BODYSTRUCTURE","item":"bodystructure","original":{"type":"ATOM","value":"BODYSTRUCTURE"}}]
        project = {_id: 1}
        options.query.forEach(q => {
            project[q.item] = 1
        })
        if(project.bodystructure || project.body || project.content || project['rfc822.size']){
            project.data = 1
            // uid and flags are needed for the fetch response and the markAsSeen handling
            project.uid = 1
            project.flags = 1
            project.modseq = 1
        }
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

    // writes an error to the Log entity, shared by onFetch and onSearch
    const logImapError = (message, meta) => {
        GenericResolver.createEntity(db, {context: context}, 'Log', {
            location: 'mailserver',
            type: 'imapError',
            message: message,
            meta
        })
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

        if (!mailAccount || !ApiUtil.compareWithHashedPassword(login.password, mailAccount.password)) {
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

        const existingFolder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (existingFolder) {
            return callback(null, 'ALREADYEXISTS')
        }

        try {
            await MailserverResolver(db).Mutation.createMailAccountFolder({
                mailAccount: session.user.id,
                path: mailbox,
                symbol: mailbox.split('/').pop(), // letztes Segment als Name
            }, { context }, { skipCheck: true })

            callback(null, true)
        } catch (err) {
            logger.error('CREATE folder failed: %s', err.message)
            callback(new Error('CREATE failed'))
        }
    }

    // RENAME "path/to/mailbox" "new/path"
    // NB! RENAME affects child and hierarchy mailboxes as well, this example does not do this
    server.onRename = async function (mailbox, newname, session, callback) {
        logger.debug('[%s] RENAME "%s" to "%s"', session.id, mailbox, newname)

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        const existingFolder = await getFolderForMailAccount(db, session.user.id, newname)
        if (existingFolder) {
            return callback(null, 'ALREADYEXISTS')
        }

        try {
            // Unterordner ebenfalls umbenennen (z.B. "Archiv/2023" → "Old/2023")
            const allFolders = await getFoldersForMailAccount(db, session.user.id)

            const childFolders = allFolders.values().filter(f =>
                f.path !== mailbox && f.path.startsWith(mailbox + '/')
            )

            for (const child of childFolders) {
                const newChildPath = newname + child.path.slice(mailbox.length)
                await MailserverResolver(db).Mutation.updateMailAccountFolder(
                    {
                        _id: child._id,
                        path: newChildPath,
                        name: newChildPath.split('/').pop()
                    },
                    { context },
                    { skipCheck: true }
                )
            }

            // Ordner selbst umbenennen
            await MailserverResolver(db).Mutation.updateMailAccountFolder(
                {
                    _id: folder._id,
                    path: newname,
                    name: newname.split('/').pop()
                },
                { context },
                { skipCheck: true }
            )

            callback(null, true)
        } catch (err) {
            logger.error('RENAME folder failed: %s', err.message)
            callback(new Error('RENAME failed'))
        }
    }

    // DELETE "path/to/mailbox"
    server.onDelete = async function (mailbox, session, callback) {
        logger.debug('[%s] DELETE "%s"', session.id, mailbox)

        const folder = await getFolderForMailAccount(db, session.user.id, mailbox)

        if (!folder) {
            return callback(null, 'NONEXISTENT')
        }

        // Optional: SPECIAL-USE Ordner schützen (Inbox, Sent, etc.)
        if (folder.specialUse || folder.path==='INBOX') {
            return callback(null, 'CANNOT')
        }

        try {
            // 1. Alle Nachrichten im Ordner löschen
            await deleteMessagesForFolderByUids(
                db,
                folder
            )

            // 2. Den Ordner selbst löschen
            await MailserverResolver(db).Mutation.deleteMailAccountFolder(
                { _id: folder._id },
                { context },
                { skipCheck: true }
            )

            callback(null, true)
        } catch (err) {
            logger.error('DELETE folder failed: %s', err.message)
            callback(new Error('DELETE failed'))
        }
    }

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

            if(destinationMessage?.data?.attachments?.length) {

                for(const attachment of destinationMessage.data.attachments) {
                    attachment.content = getAttachmentContentFromFile(attachment, {db, message: destinationMessage})
                }
            }


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

        let messageData
        const logError = (message) => {
            logImapError(message, {
                messageData,
                debug: JSON.parse(JSON.stringify({folderId, options, session}, getCircularReplacer()))
            })
        }

        // register the error handler only once per session, otherwise every fetch
        // adds another listener and node starts warning about a memory leak
        if (!session._writeStreamErrorHandlerAttached) {
            session._writeStreamErrorHandlerAttached = true
            session.writeStream.on('error', (err) => {
                logError(err.message)
            })
        }


        if (options.markAsSeen) {
            // mark all matching messages as seen
            messages.forEach(message => {
                if (options.messages.indexOf(message.uid) < 0) {
                    return
                }

                if (!message.flags) {
                    message.flags = []
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

            const finish = () => {
                // once messages are processed show relevant updates
                this.notifier.fire(session.user.id, null)
                return callback(null, true)
            }

            let processMessage = () => {
                if (pos >= messages.length) {
                    return finish()
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

                    // writes the composed message to the client stream.
                    // shared by the cached and the freshly composed path
                    const sendMailMessage = (rawMailMessage) => {
                        const queryRequest = {
                            ...message,
                            idate: new Date(message.data.date || Util.dateFromObjectId(message._id.toString(), new Date())),
                            mimeTree: parseMimeTree(rawMailMessage)
                        }

                        Hook.call('imapOnFetchMailComposed', {queryRequest, messageData, folderId, options, session})

                        const stream = imapHandler.compileStream(
                            session.formatResponse('FETCH', message.uid, {
                                query: options.query,
                                values: session.getQueryResponse(
                                    options.query,
                                    queryRequest
                                )
                            })
                        )

                        if (!stream || !session?.socket?.writable || session?.socket?.destroyed) {
                            // abort the whole fetch, otherwise the callback would never be called
                            logger.debug('[%s] socket is not ready anymore, aborting fetch', session.id)
                            return finish()
                        }

                        stream.on('error', (err) => {
                            logError('stream error: ' + err.message)
                        })

                        session.writeStream.write(stream, () => {
                            setImmediate(processMessage)
                        })
                    }

                    composeMessage(db, message, logger, session.id).then(({raw, messageData: composed}) => {
                        // on a cache hit no messageData is built, so it must be reset:
                        // otherwise the logs and the hook would carry the data of the
                        // previously processed message
                        messageData = composed || undefined

                        try {
                            sendMailMessage(raw)
                        } catch (error) {
                            logError(error.message)
                            console.error('error sending email', error)
                            setImmediate(processMessage)
                        }
                    }).catch(error => {
                        logError(error.message)
                        console.error('error building email', error)
                        setImmediate(processMessage)
                    })
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

                    if (stream && session?.socket?.writable && !session?.socket?.destroyed) {

                        stream.on('error', (err) => {
                            logError('stream error: ' + err.message)
                        })
                        session.writeStream.write(stream, () => {
                            setImmediate(processMessage)
                        })
                    } else {
                        logger.debug('[%s] socket is not ready anymore, aborting fetch', session.id)
                        return finish()
                    }
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

        const logError = (message) => {
            logImapError(message, {
                debug: JSON.parse(JSON.stringify({folderId, options, session}, getCircularReplacer()))
            })
        }

        const {match} = mongoDbMatchProjectFromIMapData(options)

        const useLocalMatching = canMatchLocally(options.query)

        // header fields are small, the body and the attachment metadata are not:
        // only pull what the query actually needs
        const project = useLocalMatching
            ? {
                'data.subject': 1, 'data.from': 1, 'data.to': 1, 'data.cc': 1, 'data.bcc': 1,
                'data.messageId': 1, 'data.inReplyTo': 1, 'data.references': 1,
                'data.date': 1, 'data.headers': 1,
                uid: 1, flags: 1, modseq: 1
            }
            : {data: 1, uid: 1, flags: 1, modseq: 1}

        const messages = await getMessagesForFolder(db, folder._id, match, project)

        logger.debug('[%s] folder %s number of messages found %s (local matching: %s)',
            session.id, folder.path, messages.length, useLocalMatching)

        let highestModseq = 0
        let uidList = []
        let checked = 0

        const collect = (message, isMatch) => {
            if (isMatch) {
                if (highestModseq < message.modseq) {
                    highestModseq = message.modseq
                }
                uidList.push(message.uid)
            }
        }

        // the callback has to be called exactly once, otherwise the client blocks
        // until its own timeout, so every async step is guarded
        const finish = () => callback(null, {uidList, highestModseq})

        const scheduleNext = () => {
            setImmediate(() => {
                checkNext().catch(err => {
                    console.error('IMAP Search checkNext', err)
                    logError('search failed: ' + err.message)
                    finish()
                })
            })
        }

        const checkNext = async () => {
            if (checked >= messages.length) {
                return finish()
            }
            const message = messages[checked++]

            if (useLocalMatching) {
                // the date is only needed for date based terms, so it is built lazily
                let idate
                const getIdate = () => {
                    if (!idate) {
                        idate = new Date(message.data?.date ||
                            Util.dateFromObjectId(message._id.toString(), new Date()))
                    }
                    return idate
                }

                try {
                    collect(message, matchLocally(message, options.query, getIdate))
                } catch (e) {
                    console.error('IMAP Search local match', e)
                    logError('local match failed: ' + e.message)
                }
                return scheduleNext()
            }

            // fallback: body searches need the composed mime tree
            try {
                const idate = new Date(message.data?.date ||
                    Util.dateFromObjectId(message._id.toString(), new Date()))
                const {raw} = await composeMessage(db, message, logger, session.id)
                const searchTarget = {...message, idate, mimeTree: parseMimeTree(raw)}

                session.matchSearchQuery(searchTarget, options.query, (err, isMatch) => {
                    if (err) {
                        console.error('IMAP Search', err, folder)
                        logError('match query failed: ' + err.message)
                    }
                    collect(message, isMatch)
                    scheduleNext()
                })
            } catch (e) {
                console.error('IMAP Search compose', e)
                logError('search compose failed: ' + e.message)
                scheduleNext()
            }
        }

        checkNext().catch(err => {
            console.error('IMAP Search checkNext', err)
            logError('search failed: ' + err.message)
            finish()
        })
    }


    server.listen(993,()=>{
        console.log("IMAP Server Listening")
    })
}


const stopListening = () => {
    // free composed mime trees, they can take up a lot of memory
    Cache.clearStartWith(MIME_TREE_CACHE_PREFIX)
}

export default {startListening, stopListening}