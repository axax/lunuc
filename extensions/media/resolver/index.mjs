import Util from '../../../api/util/index.mjs'
import {
    CAPABILITY_ACCESS_ADMIN_PAGE,
    CAPABILITY_ADMIN_OPTIONS,
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_OTHER_USERS
} from '../../../util/capabilities.mjs'
import config from '../../../gensrc/config.mjs'
import path from 'path'
import fs from 'fs'
import {fileURLToPath} from 'url'
import {ObjectId} from 'mongodb'
import {sendMail} from '../../../api/util/mail.mjs'
import {removeMediaScreenshots, removeMediaVariants, syncAllPrivateMediaFiles, mediaFileInTrash, restoreMediaFileFromTrash} from '../util/index.mjs'
import {ensureMediaReferences, updateMediaReferenceCounts} from './mediaRefMap.mjs'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import {pubsub} from '../../../api/subscription.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {UPLOAD_DIR} = config

export default db => ({
    Query: {
        // deleted media that don't exist anymore, newest delete first (one page of History entries)
        deletedMedia: async ({limit = 50, offset = 0, search}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            limit = Math.min(Math.max(limit, 1), 200)

            const match = {type: 'Media', action: 'delete'}
            if (search) {
                match['data.name'] = {$regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i'}
            }
            // one more than needed to know if there is a next page
            const entries = await db.collection('History').find(match, {
                projection: {'data._id': 1, 'data.name': 1, 'data.mimeType': 1, 'data.size': 1, createdBy: 1}
            }).sort({_id: -1}).skip(offset).limit(limit + 1).toArray()

            const hasMore = entries.length > limit
            entries.length = Math.min(entries.length, limit)

            const ids = [...new Set(entries.map(e => String(e.data._id)))]
            const existing = new Set((await db.collection('Media').find({_id: {$in: ids.map(id => new ObjectId(id))}},
                {projection: {_id: 1}}).toArray()).map(m => String(m._id)))
            const users = new Map((await db.collection('User').find({_id: {$in: [...new Set(entries.map(e => String(e.createdBy)))].filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id))}},
                {projection: {username: 1}}).toArray()).map(u => [String(u._id), u.username]))

            const seen = new Set()
            const results = []
            for (const e of entries) {
                const id = String(e.data._id)
                if (existing.has(id) || seen.has(id)) continue
                seen.add(id)
                results.push({
                    _id: id,
                    name: e.data.name,
                    mimeType: e.data.mimeType,
                    size: e.data.size,
                    deletedAt: e._id.getTimestamp().getTime(),
                    deletedBy: users.get(String(e.createdBy)) || String(e.createdBy),
                    inTrash: await mediaFileInTrash(id)
                })
            }
            return {results, hasMore}
        },
        cleanUpMedia: async ({ids}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            // first: private media still stored under the public name are moved to private<id>
            const privateMoved = await syncAllPrivateMediaFiles(db, {ids})
            const variantsRemoved = await removeMediaVariants(db, {ids})
            const screenshotsRemoved = removeMediaScreenshots({ids})

            const totalRemoved = variantsRemoved.length + screenshotsRemoved.length

            return {
                status: (totalRemoved === 0
                    ? 'no files removed'
                    : `${totalRemoved} ${totalRemoved > 1 ? 'files' : 'file'} removed ` +
                    `(${variantsRemoved.length} variant${variantsRemoved.length !== 1 ? 's' : ''}, ` +
                    `${screenshotsRemoved.length} screenshot${screenshotsRemoved.length !== 1 ? 's' : ''})`) +
                    (privateMoved ? `, ${privateMoved} private media made private again` : '')
            }
        },
        findReferencesForMedia: async ({limit, ids, match={}}, {context}) => {

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ACCESS_ADMIN_PAGE)
            const startTime = Date.now()

            // first call: builds the references (MediaReference), afterwards they are kept up to date
            await ensureMediaReferences(db)

            if (!ids) {
                const mediaIds = await db.collection('Media').find(match, {projection: {_id: 1}})
                    .sort({'references.lastChecked': 1}).limit(parseInt(limit) || 10).toArray()
                ids = mediaIds.map(f => f._id.toString())
            }
            const checkedItems = await updateMediaReferenceCounts(db, ids)

            console.log(`findReferencesForMedia ended after ${new Date().getTime() - startTime}ms`)
            return {status: `{"items":${JSON.stringify(checkedItems)}}`}
        },
        deleteOnlyMediaFiles: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)

            const result = []

            // delete file variants
            await removeMediaVariants(db, {saveMode:true, ids:_id})
            await removeMediaScreenshots({ids:_id})

            // delete original files
            for(const id of _id) {
                const fileName = path.join(__dirname, `../../../${UPLOAD_DIR}/${id}`)
                const fileExist = fs.existsSync(fileName)
                if (fileExist) {
                    console.log('delete file ' + fileName)
                    fs.unlinkSync(fileName)
                }
                result.push({_id: id,status: fileExist ? 'deleted' : 'nofile'})
            }
            return result
        },
        sendAsAttachment: async ({_id,email}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_ADMIN_OPTIONS)

            const result = []

            const attachments = []
            // delete original files
            for(const id of _id) {

                const item = await db.collection('Media').findOne({_id:new ObjectId(id)},  { projection: { name: 1 } } )
                if(item) {
                    const fileName = path.join(__dirname, `../../../${UPLOAD_DIR}/${id}`)
                    const fileExist = fs.existsSync(fileName)
                    if (fileExist) {
                        attachments.push( {
                            filename: item.name,
                            path: fileName
                        })
                        result.push({_id: id, status: 'attached'})
                    }else{
                        result.push({_id: id, status: 'no file'})
                    }
                }else{
                    result.push({_id: id, status: 'not found'})
                }
            }
            if(attachments.length>0) {
                await sendMail(db, req.context, {
                    body: attachments.map(a=>a.filename).join(', '),
                    attachments,
                    recipient: email,
                    subject: 'Medias from lunuc',
                    req
                })
            }
            return result
        }
    },
    Mutation: {
        // admins only: deletes media even if they are still used (the normal delete refuses that)
        forceDeleteMedia: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            const result = await GenericResolver.deleteEnities(db, context, 'Media', {_id}, {ignoreUsage: true})
            pubsub.publish('subscribeMedia', {userId: context.id, subscribeMedia: {action: 'delete', removedIds: _id}}, db, context)
            return result
        },
        // restores deleted media: the entry from the last delete in the History, the file from the trash
        restoreMedia: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            const result = []
            for (const id of _id) {
                if (!ObjectId.isValid(id)) {
                    result.push({_id: id, status: 'invalid'})
                    continue
                }
                if (await db.collection('Media').countDocuments({_id: new ObjectId(id)}, {limit: 1})) {
                    result.push({_id: id, status: 'exists'})
                    continue
                }
                const entry = await db.collection('History').find({type: 'Media', action: 'delete', 'data._id': new ObjectId(id)})
                    .sort({_id: -1}).limit(1).next()
                if (!entry) {
                    result.push({_id: id, status: 'not_found'})
                    continue
                }
                await db.collection('Media').insertOne({...entry.data, modifiedAt: Date.now()})
                const fileRestored = await restoreMediaFileFromTrash(id, entry.data.private)
                result.push({_id: id, status: fileRestored ? 'restored' : 'restored_without_file'})
            }
            const restoredIds = result.filter(r => r.status.startsWith('restored')).map(r => r._id)
            if (restoredIds.length) {
                pubsub.publish('subscribeMedia', {userId: context.id, subscribeMedia: {action: 'create', data: restoredIds.map(id => ({_id: id}))}}, db, context)
                console.log(`restoreMedia: ${restoredIds.length} media restored by ${context.username}`)
            }
            return result
        },
        // copies a folder incl. all subfolders as new MediaGroups, the media files are not linked to the copy
        copyMediaGroupStructure: async ({_id, name}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)
            const collection = db.collection('MediaGroup')
            const source = await collection.findOne({_id: new ObjectId(_id)})
            if (!source) {
                throw new Error('Folder with id ' + _id + ' does not exist')
            }
            if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
                const allowedIds = (await Util.userAndJuniorIds(db, context.id)).map(String)
                if (allowedIds.indexOf(String(source.createdBy)) < 0) {
                    throw new Error('Error copying folder. You might not have permissions to copy this folder')
                }
            }

            // collect all subfolders (breadth first, the visited set protects against cycles)
            const childrenByParent = new Map()
            const visited = new Set([String(source._id)])
            let level = [source._id]
            while (level.length) {
                const children = await collection.find({group: {$in: level}}).toArray()
                level = []
                for (const child of children) {
                    const childId = String(child._id)
                    if (visited.has(childId)) continue
                    visited.add(childId)
                    level.push(child._id)
                    for (const parentId of (child.group || []).map(String)) {
                        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
                        childrenByParent.get(parentId).push(child)
                    }
                }
            }

            let count = 0
            const copyFolder = async (folder, group, folderName) => {
                const data = {name: folderName, group}
                if (folder.ownerGroup && folder.ownerGroup.length) data.ownerGroup = folder.ownerGroup
                if (folder.autoClean !== undefined && folder.autoClean !== null) data.autoClean = folder.autoClean
                const created = await GenericResolver.createEntity(db, req, 'MediaGroup', data)
                count++
                const newId = new ObjectId(created._id)
                for (const child of (childrenByParent.get(String(folder._id)) || [])) {
                    await copyFolder(child, [newId], child.name)
                }
                return created
            }

            const rootCopy = await copyFolder(source, source.group || [], name || (source.name + ' (copy)'))
            return {
                _id: rootCopy._id,
                name: rootCopy.name,
                parent: source.group && source.group.length ? source.group[0] : null,
                count
            }
        }
    }
})
