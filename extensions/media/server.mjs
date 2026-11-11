import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import fs from 'fs'
import path from 'path'
import config from '../../gensrc/config.mjs'
import React from 'react'
import {ObjectId} from 'mongodb'
import Util from '../../api/util/index.mjs'
import { CAPABILITY_RUN_COMMAND} from '../../util/capabilities.mjs'
//import {uploadImageToStorage}  from './googleupload.mjs'
import {createMediaEntry, removeMediaScreenshots, removeMediaVariants} from './util/index.mjs'
import { fileURLToPath } from 'url'
import {_t, registerTrs} from '../../util/i18nServer.mjs'

import {translations} from './translations/translations-server.js'
registerTrs(translations, 'MediaTranslations')

import {
    CAPABILITY_MEDIA_REFERENCES
} from './constants/index.mjs'
import GenericResolver from "../../api/resolver/generic/genericResolver.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {UPLOAD_DIR, UPLOAD_URL} = config

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})

// Hook to add or modify user roles
Hook.on('createUserRoles', ({userRoles}) => {
    userRoles.forEach(userRole => {
        if (['administrator', 'editor', 'author'].indexOf(userRole.name) >= 0) {
            console.log(`Add capabilities "${CAPABILITY_MEDIA_REFERENCES}" for user role "${userRole.name}"`)
            userRole.capabilities.push(CAPABILITY_MEDIA_REFERENCES)
        }
    })
})

// Hook when an entry of the type Media was deleted
Hook.on('typeDeleted_Media', ({ids}) => {
    // delete files
    for(const id of ids) {
        const fileName = path.join(__dirname, '../../' + UPLOAD_DIR + '/' + id)
        const fileNamePrivate = path.join(__dirname, '../../' + UPLOAD_DIR + '/private' + id)

        if (fs.existsSync(fileNamePrivate)) {
            console.log('delete file ' + fileNamePrivate)
            fs.unlinkSync(fileNamePrivate)
        }

        if (fs.existsSync(fileName)) {
            console.log('delete file ' + fileName)
            fs.unlinkSync(fileName)
        }
    }
})

Hook.on('typeUpdated_Media', ({result}) => {
    addFilePrefix(result)
})

Hook.on('typeBeforeDelete', async ({db, type, data}) => {
    if(type==='MediaGroup') {
        let count = await db.collection('Media').count({group: {$in:[new ObjectId(data._id)]}})
        if(count===0){
            count = await db.collection('MediaGroup').count({group: {$in:[new ObjectId(data._id)]}})
        }
        if(count>0) {
            throw new Error(_t('media.group.delete.error'))
        }
    }
})

// ─── folder hierarchy guard ───────────────────────────────────────────────────
// a folder (MediaGroup) must never be its own parent or end up inside one of its own
// subfolders - it would disappear from the root of the media views together with
// everything inside it. Checked on every create / update (edit, move, bulk edit, import).
const toObjectIds = (value) => {
    if (value === undefined || value === null || value === '') return []
    return (Array.isArray(value) ? value : [value])
        .map(v => (v && typeof v === 'object' && v._id) ? v._id : v)
        .filter(v => v && ObjectId.isValid(v))
        .map(v => new ObjectId(v.toString()))
}

const assertNoFolderCycle = async (db, folderId, parentIds) => {
    if (!folderId || !parentIds.length) return
    const selfId = folderId.toString()
    const visited = new Set()
    let level = parentIds
    // walk up the parents level by level (one query per level, only _id and group)
    while (level.length) {
        if (level.some(id => id.toString() === selfId)) {
            throw new Error(_t('media.group.cycle.error'))
        }
        level.forEach(id => visited.add(id.toString()))
        const parents = await db.collection('MediaGroup')
            .find({_id: {$in: level}}, {projection: {group: 1}}).toArray()
        level = parents.flatMap(p => toObjectIds(p.group)).filter(id => !visited.has(id.toString()))
    }
}

Hook.on('typeBeforeUpdate', async ({db, type, data, params}) => {
    if (type !== 'MediaGroup' || !data || data.group === undefined) return
    let folderId = params?._id || data._id
    if (!folderId && params && Object.keys(params).length) {
        const doc = await db.collection('MediaGroup').findOne(params, {projection: {_id: 1}})
        folderId = doc?._id
    }
    await assertNoFolderCycle(db, folderId, toObjectIds(data.group))
})

Hook.on('typeBeforeCreate', async ({db, type, data}) => {
    // a new folder has no children yet, only a given _id (import) can point to itself
    if (type !== 'MediaGroup' || !data?._id || data.group === undefined) return
    await assertNoFolderCycle(db, data._id, toObjectIds(data.group))
})

const addFilePrefix = (result) => {
    const fileName = path.join(__dirname, '../../' + UPLOAD_DIR + '/' + result._id)
    const fileNamePrivate = path.join(__dirname, '../../' + UPLOAD_DIR + '/private' + result._id)

    try {
        if (result.private && fs.existsSync(fileName)) {
            fs.renameSync(fileName, fileNamePrivate)
        } else if(fs.existsSync(fileNamePrivate)){
            fs.renameSync(fileNamePrivate, fileName)
        }
    }catch (e) {
        console.log(e)
    }
}


// add some extra data to the table
/*Hook.on('TypeTable', ({type, dataSource, data, container}) => {
    if (type === 'Media') {
        dataSource.forEach((d, i) => {
            if (d.src) {
                const {_version} = container.pageParams
                const item = data.results[i]
                d.src = <a href={item.src}></a>
            }
        })
    }
})*/

// Hook when db is ready
Hook.on('FileUpload', async ({db, req, context, file, data, response}) => {
    let replaceMode = false

    if(data._id){
        // replacing an existing file needs a login - for visitors without login the
        // ownership check can't tell one visitor's upload from another one's
        if (!req.context || !req.context.id) {
            throw new Error('Login required to replace a file')
        }
        if( !ObjectId.isValid(data._id)) {
            throw new Error('Invalid _id')
        }
        const medias = await GenericResolver.entities(db, req, 'Media', ['_id'], {limit:1, filter:`_id=${data._id}`})
        if(medias.results.length===0){
            throw new Error('Media not found')
        }else{
            replaceMode = true
        }
    }


    const _id = data._id ? new ObjectId(data._id): new ObjectId()

    // obsolete
    if( !response.fileIds){
        response.fileIds = []
    }
    response.fileIds.push(_id)


    if(!response.files){
        response.files = []
    }
    response.files.push({
        _id,
        name: file.originalFilename,
        size: file.size,
        mimeType: file.mimetype
    })


    let uploadResult
    if( data.useCdn ) {

       // uploadResult = await uploadImageToStorage({file})
        //data.src = uploadResult.url
    }

    if( !uploadResult || uploadResult.error ){
        // fallback
        // store file under the name of the _id
        let upload_dir, finalName = _id.toString()
        if(data.uploadDir){
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            upload_dir = data.uploadDir


            if(data.keepFileName){
                finalName = file.originalFilename
            }

        }else{
            upload_dir = path.join(__dirname, '../../' + UPLOAD_DIR)
        }

        if(!upload_dir || !fs.existsSync(upload_dir)){
            throw new Error(`Upload dir doesn't exist`)
        }


        // awaited: the response of the upload is only sent when the file is in place and the Media entry exists
        // (callers use the returned ids right away, e.g. to put the files into a folder); an error ends the
        // upload with a message instead of an uncaught exception
        await fs.promises.copyFile(file.filepath, path.join(upload_dir, finalName))
        if( data.createMediaEntry !== false) {
            await createMediaEntry({db, _id, file, data, context})
        }
        if(replaceMode) {
            await removeMediaVariants(db, {ids:[data._id],saveMode:true})
            await removeMediaScreenshots({ids:[data._id]})
        }
    }else{
        if( data.createMediaEntry !== false) {
            await createMediaEntry({db, file, data, context, _id})
        }
    }

})