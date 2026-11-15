import Util from 'api/util/index.mjs'
import {ObjectId} from 'mongodb'
import {withFilter} from 'graphql-subscriptions'
import Hook from '../../../util/hook.cjs'
import {pubsub} from '../../../api/subscription.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import config from '../../../gensrc/config.mjs'

const {ADMIN_BASE_URL} = config

/*
 * Messenger api (admin/chat).
 * Everything here checks that the current user is a member of the chat. Events are published
 * on 'subscribeChatEvent' with the list of recipients (_users), so the subscription filter
 * needs no db access.
 */

const EVENT = 'subscribeChatEvent'
const MAX_MESSAGE_LENGTH = 10000
const MAX_MEDIA = 10
const MAX_USERS = 500
// roles a user with manage_other_users can always chat with (as before)
const STAFF_ROLES = ['administrator', 'editor', 'author']

const oid = (id, name = 'id') => {
    if (!id || !ObjectId.isValid(String(id))) {
        throw new Error(`Invalid ${name}`)
    }
    return new ObjectId(String(id))
}

const str = v => (v === undefined || v === null ? v : String(v))

const memberIds = room => {
    const ids = (room.users || []).filter(Boolean).map(String)
    if (room.createdBy && ids.indexOf(String(room.createdBy)) < 0) {
        ids.push(String(room.createdBy))
    }
    return ids
}

const getRoom = async (db, context, chatId) => {
    Util.checkIfUserIsLoggedIn(context)
    const uid = oid(context.id)
    const room = await db.collection('Chat').findOne({_id: oid(chatId, 'chat'), $or: [{users: uid}, {createdBy: uid}]})
    if (!room) {
        throw new Error('Chat not found')
    }
    return room
}

const loadUsers = async (db, ids) => {
    const unique = [...new Set(ids.filter(Boolean).map(String))].filter(id => ObjectId.isValid(id))
    const map = {}
    if (unique.length) {
        const users = await db.collection('User').find({_id: {$in: unique.map(id => new ObjectId(id))}})
            .project({username: 1, picture: 1}).toArray()
        users.forEach(u => {
            map[String(u._id)] = {_id: String(u._id), username: u.username, picture: str(u.picture) || null}
        })
    }
    return map
}

/*
 * Who a user can start a chat with / add to a group:
 * - everybody he shares a user group with, whatever the role (also subscribers)
 * - with manage_other_users additionally all users with a staff role
 * Blocked users and the user himself are left out. Returns null if there is nobody.
 */
const chatUserMatch = async (db, context) => {
    const me = await db.collection('User').findOne({_id: oid(context.id)}, {projection: {group: 1}})
    const or = []
    if (me && me.group && me.group.length) {
        or.push({group: {$in: me.group}})
    }
    if (await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
        const roles = await db.collection('UserRole').find({name: {$in: STAFF_ROLES}}).project({_id: 1}).toArray()
        if (roles.length) {
            or.push({role: {$in: roles.map(r => r._id)}})
        }
    }
    if (!or.length) {
        return null
    }
    return {$and: [{$or: or}, {_id: {$ne: oid(context.id)}}, {blocked: {$ne: true}}]}
}

/* throws unless the current user may chat with all of these users */
const checkChatUsers = async (db, context, userIds) => {
    const ids = [...new Set(userIds.map(String))].filter(id => id !== String(context.id))
    if (!ids.length) return
    const match = await chatUserMatch(db, context)
    const found = match ? await db.collection('User').find({$and: [match, {_id: {$in: ids.map(id => new ObjectId(id))}}]})
        .project({_id: 1}).toArray() : []
    if (found.length !== ids.length) {
        throw new Error('User doesnt exist')
    }
}

const userOrUnknown = (map, id) => map[String(id)] || {_id: String(id), username: '?', picture: null}

const loadMedia = async (db, messages) => {
    const ids = []
    messages.forEach(m => (m.media || []).forEach(id => id && ids.push(id)))
    const map = {}
    if (ids.length) {
        const medias = await db.collection('Media').find({_id: {$in: ids}}).project({name: 1, mimeType: 1}).toArray()
        medias.forEach(m => {
            map[String(m._id)] = {_id: String(m._id), name: m.name, mimeType: m.mimeType}
        })
    }
    return map
}

const toMsg = (doc, userMap, mediaMap) => ({
    _id: String(doc._id),
    chat: String(doc.chat),
    message: doc.deleted ? '' : doc.message,
    createdBy: userOrUnknown(userMap, doc.createdBy),
    readBy: (doc.readBy || []).map(String),
    replyTo: doc.deleted ? null : (doc.replyTo ? (typeof doc.replyTo === 'string' ? doc.replyTo : JSON.stringify(doc.replyTo)) : null),
    reactions: doc.deleted ? null : (doc.reactions ? (typeof doc.reactions === 'string' ? doc.reactions : JSON.stringify(doc.reactions)) : null),
    media: doc.deleted ? [] : (doc.media || []).map(id => mediaMap[String(id)]).filter(Boolean),
    edited: !!doc.edited,
    deleted: !!doc.deleted
})

const toMsgs = async (db, docs) => {
    const [userMap, mediaMap] = await Promise.all([
        loadUsers(db, docs.map(d => d.createdBy)),
        loadMedia(db, docs)
    ])
    return docs.map(d => toMsg(d, userMap, mediaMap))
}

const toRoom = (room, userMap, extra = {}) => ({
    _id: String(room._id),
    name: room.name,
    direct: !!room.direct,
    createdBy: str(room.createdBy),
    users: memberIds(room).map(id => userOrUnknown(userMap, id)),
    unread: 0,
    muted: false, // per user, only set where the room is returned to one user (chatRooms)
    lastMessage: null,
    ...extra
})

const roomForClient = async (db, room) => toRoom(room, await loadUsers(db, memberIds(room)))

const publish = (users, from, event) => {
    pubsub.publish(EVENT, {_users: users.map(String), _from: String(from), [EVENT]: event})
}

const parseReactions = value => {
    if (!value) return []
    try {
        const r = typeof value === 'string' ? JSON.parse(value) : value
        return Array.isArray(r) ? r : []
    } catch (e) {
        return []
    }
}

const getOwnMessage = async (db, context, _id) => {
    Util.checkIfUserIsLoggedIn(context)
    const msg = await db.collection('ChatMessage').findOne({_id: oid(_id)})
    if (!msg) {
        throw new Error('Message not found')
    }
    const room = await getRoom(db, context, msg.chat)
    return {msg, room}
}

const PUSH_TEXT = {
    de: {newMessage: 'Neue Nachricht', attachment: 'Anhang'},
    en: {newMessage: 'New message', attachment: 'Attachment'}
}

/* web push to the devices of the other members (extension push, nothing happens without it) */
const pushMessage = (db, context, room, message) => {
    const muted = (room.mutedBy || []).map(String)
    const userIds = memberIds(room).filter(id => id !== String(context.id) && muted.indexOf(id) < 0)
    if (!userIds.length) return
    const adminUrl = `${ADMIN_BASE_URL}/chat/${room._id}`
    const picture = message.createdBy.picture
    Hook.call('pushSend', {
        db,
        userIds,
        notification: (subscription) => {
            const text = PUSH_TEXT[subscription.lang] || PUSH_TEXT.en
            const media = message.media && message.media[0]
            const preview = message.message || (media ? (String(media.mimeType).indexOf('image') === 0 ? '📷 ' : '📎 ') + (media.name || text.attachment) : '')
            // the device decides whether the text of a message is shown (_app_.push.setSettings)
            const body = subscription.settings && subscription.settings.chatPreview === false ? text.newMessage : preview
            // a device that uses the messenger on a CmsPage is led there (chatStore setHome)
            const home = subscription.settings && subscription.settings.chatUrl
            const useHome = typeof home === 'string' && home.length <= 200 && /^\/(?!\/)[\w\-./]*(#[\w\-./]*)?$/.test(home)
            return {
                title: room.direct ? context.username : room.name,
                body: (room.direct ? '' : context.username + ': ') + body,
                url: useHome ? home + room._id : adminUrl,
                tag: 'lunuc-chat-' + room._id,
                icon: picture ? `/uploads/${picture}?format=jpeg&width=192&height=192` : undefined,
                // shown by the page itself while the chat (on a CmsPage: the messenger) is open and focused
                skipIfFocused: useHome ? home.split('#')[0] : true
            }
        }
    })
}

const publishMessage = async (db, context, room, doc, type, nonce) => {
    const message = (await toMsgs(db, [doc]))[0]
    if (nonce) {
        message.nonce = String(nonce).substring(0, 64)
    }
    publish(memberIds(room), context.id, {type, chat: String(room._id), user: context.id, username: context.username, message})
    return message
}

const addUser = async (db, context, chatId, userId) => {
    const room = await getRoom(db, context, chatId)
    if (room.direct) {
        throw new Error('Users can not be added to a direct chat')
    }
    const user = {_id: oid(userId, 'user')}
    await checkChatUsers(db, context, [userId])
    await db.collection('Chat').updateOne({_id: room._id}, {$addToSet: {users: user._id}})
    const updated = await db.collection('Chat').findOne({_id: room._id})
    const result = await roomForClient(db, updated)
    publish(memberIds(updated), context.id, {type: 'room', chat: result._id, user: context.id, username: context.username, room: result})
    return result
}

const removeUser = async (db, context, chatId, userId) => {
    const room = await getRoom(db, context, chatId)
    const target = String(oid(userId, 'user'))
    const isSelf = target === String(context.id)
    if (!isSelf && String(room.createdBy) !== String(context.id) &&
        !await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
        throw new Error('Only the creator of the chat can remove users')
    }
    const before = memberIds(room)
    const remaining = before.filter(id => id !== target)

    if (remaining.length === 0) {
        // last member leaves -> the chat is removed
        await db.collection('ChatMessage').deleteMany({chat: room._id})
        await db.collection('Chat').deleteOne({_id: room._id})
        publish(before, context.id, {type: 'roomRemoved', chat: String(room._id), user: context.id})
        return toRoom({...room, users: []}, {})
    }

    const update = {$pull: {users: new ObjectId(target), mutedBy: new ObjectId(target)}}
    if (String(room.createdBy) === target) {
        // hand the chat over to the next member
        update.$set = {createdBy: new ObjectId(remaining[0])}
    }
    await db.collection('Chat').updateOne({_id: room._id}, update)
    const updated = await db.collection('Chat').findOne({_id: room._id})
    const result = await roomForClient(db, updated)
    publish(remaining, context.id, {type: 'room', chat: result._id, user: context.id, username: context.username, room: result})
    publish([target], context.id, {type: 'roomRemoved', chat: result._id, user: context.id})
    return result
}

export default (db) => ({
    Query: {
        chatRooms: async (args, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const uid = oid(context.id)
            const rooms = await db.collection('Chat').find({$or: [{users: uid}, {createdBy: uid}]}).limit(500).toArray()
            if (!rooms.length) {
                return []
            }
            const roomIds = rooms.map(r => r._id)
            const messages = db.collection('ChatMessage')

            const [lasts, unreads] = await Promise.all([
                Promise.all(roomIds.map(chat => messages.find({chat}).sort({_id: -1}).limit(1).toArray())),
                messages.aggregate([
                    {$match: {chat: {$in: roomIds}, readBy: {$ne: uid}, createdBy: {$ne: uid}, deleted: {$ne: true}}},
                    {$group: {_id: '$chat', count: {$sum: 1}}}
                ]).toArray()
            ])
            const lastDocs = lasts.map(l => l[0]).filter(Boolean)
            const lastMsgs = await toMsgs(db, lastDocs)
            const lastByChat = {}, unreadByChat = {}
            lastMsgs.forEach(m => {
                lastByChat[m.chat] = m
            })
            unreads.forEach(u => {
                unreadByChat[String(u._id)] = u.count
            })

            const userIds = []
            rooms.forEach(r => userIds.push(...memberIds(r)))
            const userMap = await loadUsers(db, userIds)

            return rooms.map(r => toRoom(r, userMap, {
                muted: (r.mutedBy || []).some(id => String(id) === String(context.id)),
                unread: unreadByChat[String(r._id)] || 0,
                lastMessage: lastByChat[String(r._id)] || null
            }))
        },
        chatUsers: async ({search}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const match = await chatUserMatch(db, context)
            if (!match) {
                return []
            }
            const term = (search || '').trim().substring(0, 100)
            if (term) {
                match.$and.push({username: {$regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i'}})
            }
            const users = await db.collection('User').find(match).project({username: 1, picture: 1})
                .sort({username: 1}).limit(MAX_USERS).toArray()
            return users.map(u => ({_id: String(u._id), username: u.username, picture: str(u.picture) || null}))
        },
        chatRoomMessages: async ({chat, before, limit}, {context}) => {
            const room = await getRoom(db, context, chat)
            const match = {chat: room._id}
            if (before) {
                match._id = {$lt: oid(before, 'before')}
            }
            const docs = await db.collection('ChatMessage').find(match).sort({_id: -1})
                .limit(Math.min(Math.max(parseInt(limit) || 50, 1), 200)).toArray()
            // newest first
            return toMsgs(db, docs)
        }
    },
    Mutation: {
        chatCreateRoom: async ({name, users, direct}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const me = String(context.id)
            const ids = [...new Set([me, ...(users || []).map(id => String(oid(id, 'user')))])]
            await checkChatUsers(db, context, ids)
            const existing = await db.collection('User').find({_id: {$in: ids.map(id => new ObjectId(id))}})
                .project({_id: 1, username: 1}).toArray()
            if (existing.length !== ids.length) {
                throw new Error('User doesnt exist')
            }
            const chats = db.collection('Chat')

            if (direct) {
                if (ids.length !== 2) {
                    throw new Error('A direct chat needs exactly one other user')
                }
                const objIds = ids.map(id => new ObjectId(id))
                const found = await chats.findOne({direct: true, users: {$all: objIds, $size: 2}})
                if (found) {
                    return roomForClient(db, found)
                }
                name = existing.map(u => u.username).join(', ')
            }
            name = (name || '').trim().substring(0, 100)
            if (!name) {
                throw new Error('Name is missing')
            }
            const doc = {
                name,
                direct: !!direct,
                users: ids.map(id => new ObjectId(id)),
                createdBy: new ObjectId(me)
            }
            const inserted = await chats.insertOne(doc)
            doc._id = inserted.insertedId
            const result = await roomForClient(db, doc)
            publish(ids, me, {type: 'room', chat: result._id, user: me, username: context.username, room: result})
            return result
        },
        chatRenameRoom: async ({chat, name}, {context}) => {
            const room = await getRoom(db, context, chat)
            name = (name || '').trim().substring(0, 100)
            if (!name || room.direct) {
                throw new Error('Chat can not be renamed')
            }
            await db.collection('Chat').updateOne({_id: room._id}, {$set: {name}})
            const result = await roomForClient(db, {...room, name})
            publish(memberIds(room), context.id, {type: 'room', chat: result._id, user: context.id, username: context.username, room: result})
            return result
        },
        chatAddUser: async ({chat, user}, {context}) => addUser(db, context, chat, user),
        chatRemoveUser: async ({chat, user}, {context}) => removeUser(db, context, chat, user),
        chatDeleteRoom: async ({chat}, {context}) => {
            const room = await getRoom(db, context, chat)
            // a direct chat can be deleted by both users
            if (!room.direct && String(room.createdBy) !== String(context.id) &&
                !await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
                throw new Error('Only the creator can delete the chat')
            }
            await db.collection('ChatMessage').deleteMany({chat: room._id})
            await db.collection('Chat').deleteOne({_id: room._id})
            publish(memberIds(room), context.id, {type: 'roomRemoved', chat: String(room._id), user: context.id})
            return true
        },
        chatSend: async ({chat, message, replyTo, media, nonce}, {context}) => {
            const room = await getRoom(db, context, chat)
            message = (message || '').trim()
            if (message.length > MAX_MESSAGE_LENGTH) {
                throw new Error('Message is too long')
            }
            const mediaIds = (media || []).slice(0, MAX_MEDIA).map(id => oid(id, 'media'))
            if (!message && !mediaIds.length) {
                throw new Error('Message is empty')
            }
            const uid = oid(context.id)
            const doc = {message, chat: room._id, createdBy: uid, readBy: [uid]}
            if (mediaIds.length) {
                doc.media = mediaIds
            }
            if (replyTo) {
                // snapshot of the quoted message (must belong to the same chat)
                const quoted = await db.collection('ChatMessage').findOne({_id: oid(replyTo, 'replyTo'), chat: room._id})
                if (quoted && !quoted.deleted) {
                    const author = await loadUsers(db, [quoted.createdBy])
                    doc.replyTo = JSON.stringify({
                        _id: String(quoted._id),
                        user: String(quoted.createdBy),
                        username: userOrUnknown(author, quoted.createdBy).username,
                        message: (quoted.message || '').substring(0, 300),
                        media: (quoted.media || []).length
                    })
                }
            }
            const inserted = await db.collection('ChatMessage').insertOne(doc)
            doc._id = inserted.insertedId
            const result = await publishMessage(db, context, room, doc, 'message', nonce)
            pushMessage(db, context, room, result)
            return result
        },
        chatEdit: async ({_id, message}, {context}) => {
            const {msg, room} = await getOwnMessage(db, context, _id)
            message = (message || '').trim()
            if (String(msg.createdBy) !== String(context.id) || msg.deleted) {
                throw new Error('Message can not be edited')
            }
            if (!message || message.length > MAX_MESSAGE_LENGTH) {
                throw new Error('Invalid message')
            }
            if (message !== msg.message) {
                await db.collection('ChatMessage').updateOne({_id: msg._id}, {$set: {message, edited: true}})
                msg.message = message
                msg.edited = true
            }
            return publishMessage(db, context, room, msg, 'edit')
        },
        chatDelete: async ({_id}, {context}) => {
            const {msg, room} = await getOwnMessage(db, context, _id)
            if (String(msg.createdBy) !== String(context.id) &&
                !await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
                throw new Error('Message can not be deleted')
            }
            // kept as placeholder ("message was deleted"), content is removed
            await db.collection('ChatMessage').updateOne({_id: msg._id},
                {$set: {message: '', deleted: true, edited: false}, $unset: {media: '', reactions: '', replyTo: ''}})
            return publishMessage(db, context, room, {...msg, message: '', deleted: true, edited: false}, 'edit')
        },
        chatReact: async ({_id, emoji}, {context}) => {
            const {msg, room} = await getOwnMessage(db, context, _id)
            if (msg.deleted) {
                throw new Error('Message was deleted')
            }
            emoji = (emoji || '').trim()
            if (emoji.length > 16) {
                throw new Error('Invalid emoji')
            }
            const me = String(context.id)
            const reactions = parseReactions(msg.reactions)
            const mine = reactions.find(r => r.u === me)
            const rest = reactions.filter(r => r.u !== me)
            // one reaction per user, the same emoji again removes it
            if (emoji && (!mine || mine.e !== emoji)) {
                rest.push({e: emoji, u: me, n: context.username})
            }
            msg.reactions = rest.length ? JSON.stringify(rest) : null
            await db.collection('ChatMessage').updateOne({_id: msg._id},
                rest.length ? {$set: {reactions: msg.reactions}} : {$unset: {reactions: ''}})
            return publishMessage(db, context, room, msg, 'edit')
        },
        chatMarkRead: async ({chat}, {context}) => {
            const room = await getRoom(db, context, chat)
            const uid = oid(context.id)
            const result = await db.collection('ChatMessage').updateMany({chat: room._id, readBy: {$ne: uid}}, {$addToSet: {readBy: uid}})
            if (result.modifiedCount > 0) {
                publish(memberIds(room), context.id, {type: 'read', chat: String(room._id), user: String(context.id), username: context.username})
            }
            return true
        },
        /* mute is stored per user on the chat, so it also applies to push and all devices */
        chatMute: async ({chat, muted}, {context}) => {
            const room = await getRoom(db, context, chat)
            const uid = oid(context.id)
            await db.collection('Chat').updateOne({_id: room._id}, muted ? {$addToSet: {mutedBy: uid}} : {$pull: {mutedBy: uid}})
            return !!muted
        },
        chatTyping: async ({chat}, {context}) => {
            const room = await getRoom(db, context, chat)
            publish(memberIds(room), context.id, {type: 'typing', chat: String(room._id), user: String(context.id), username: context.username})
            return true
        },

        /* kept for compatibility, same checks as chatAddUser / chatRemoveUser */
        addUserToChat: async ({chatId, userId}, {context}) => {
            await addUser(db, context, chatId, userId)
            return {_id: chatId, status: 'user_added'}
        },
        removeUserFromChat: async ({chatId, userId}, {context}) => {
            await removeUser(db, context, chatId, userId)
            return {_id: chatId, status: 'user_removed'}
        }
    },
    Subscription: {
        subscribeChatEvent: withFilter(() => pubsub.asyncIterableIterator(EVENT),
            (payload, context) => {
                if (!payload || !context || !context.id || !payload._users) {
                    return false
                }
                const id = String(context.id)
                if (payload._users.indexOf(id) < 0) {
                    return false
                }
                // nobody needs to know that he is typing himself
                return !(payload[EVENT].type === 'typing' && payload._from === id)
            }
        )
    }
})
