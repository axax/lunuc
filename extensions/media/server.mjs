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
import ImageClassfier from './util/imageClassifierLambda.mjs'
import {ObjectId} from 'mongodb'
import mediaResolver from './gensrc/resolver.mjs'
import Util from '../../api/util/index.mjs'
import {CAPABILITY_RUN_COMMAND} from '../../util/capabilities.mjs'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import ffmpeg from 'fluent-ffmpeg'
import {uploadImageToStorage}  from './googleupload.mjs'

import { fileURLToPath } from 'url'
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

    const _id = data._id ? ObjectId(data._id): ObjectId()

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



const removeInvalidProperties = function (obj) {
    for (const i in obj) {
        if(i.indexOf('.')>=0){
            delete obj[i]
        }else {
            const v = obj[i]
            if (v) {
                if (v.constructor === Array) {
                    v.forEach((x) => {
                        if (x.constructor === Object) {
                            removeInvalidProperties(x)
                        }
                    })
                } else if (v.constructor === Object) {
                    removeInvalidProperties(v)
                }
            }
        }
    }
    return null
}


const createMediaEntry = async ({db, _id, file, data, context}) => {
    // const mimeType = MimeType.detectByFileName(file.name)
    // call image classifier if requested
    if (data.classifyImage) {
        data.meta = JSON.stringify(await ImageClassfier.classifyByUrl(data.url || ('http://www.lunuc.com' + UPLOAD_URL + '/' + _id.toString()) )) //)
    }

    if( file.mimetype.indexOf('audio/')===0 || file.mimetype.indexOf('video/')===0){

        try {


            ffmpeg.setFfprobePath(ffprobeInstaller.path)
            ffmpeg.setFfmpegPath( ffmpegInstaller.path)


            const {meta} = await (new Promise((resolve) => {
                ffmpeg.ffprobe(file.filepath, function (error, meta) {
                    if (error) {
                        console.warn(error)
                    }
                    resolve({error, meta})
                })
            }))
            removeInvalidProperties(meta)
            data.info = meta
        }catch (e) {
            console.warn('error in ffprobe', e)
        }
    }




    const media = {
        name: file.originalFilename,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        ...data
    }

    if (_id) {
        media._id = _id
    }

    if(!data._id) {
        // save to db
        mediaResolver(db).Mutation.createMedia(media, {context})
    }else{
        // update media
        mediaResolver(db).Mutation.updateMedia(media, {context})
    }
}
