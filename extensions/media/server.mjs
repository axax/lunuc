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
import {CAPABILITY_RUN_COMMAND} from '../../util/capabilities.mjs'
import {uploadImageToStorage}  from './googleupload.mjs'
import {createMediaEntry} from './util/index.mjs'
import { fileURLToPath } from 'url'
import {
    CAPABILITY_MEDIA_REFERENCES
} from './constants/index.mjs'
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
        if (['administrator', 'editor'].indexOf(userRole.name) >= 0) {
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
        if (fs.existsSync(fileName)) {
            console.log('delete file ' + fileName)
            fs.unlinkSync(fileName)
        }
    }
})

Hook.on('typeUpdated_Media', ({result}) => {
    addFilePrefix(result)
})

const addFilePrefix = (result) => {
    const fileName = path.join(__dirname, '../../' + UPLOAD_DIR + '/' + result._id)
    const fileNamePrivate = path.join(__dirname, '../../' + UPLOAD_DIR + '/private' + result._id)

    try {
        if (result.private) {
            fs.renameSync(fileName, fileNamePrivate)
        } else {
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
Hook.on('FileUpload', async ({db, context, file, data, response}) => {

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

        uploadResult = await uploadImageToStorage({file})
        data.src = uploadResult.url
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


        fs.copyFile(file.filepath, path.join(upload_dir, finalName), async (err) => {
            if (err) throw err
            if( data.createMediaEntry !== false) {
                createMediaEntry({db, _id, file, data, context})
            }
        })
    }else{
        if( data.createMediaEntry !== false) {
            createMediaEntry({db, file, data, context, _id})
        }
    }

})