import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import fs from 'fs'
import path from 'path'

import config from 'gen/config'
import React from 'react'
import ImageClassfier from './util/imageClassifierLambda'
import {ObjectId} from 'mongodb'
import mediaResolver from './gensrc/resolver'
import Util from '../../api/util'
import {CAPABILITY_RUN_COMMAND} from '../../util/capabilities'

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
Hook.on('TypeTable', ({type, dataSource, data, container}) => {
    if (type === 'Media') {
        dataSource.forEach((d, i) => {
            if (d.src) {
                const {_version} = container.pageParams
                const item = data.results[i]
                d.src = <a href={item.src}></a>
            }
        })
    }
})

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
        name: file.name,
        size: file.size,
        mimeType: file.type
    })


    let uploadResult
    if( data.useCdn ) {
        const uploadImageToStorage = require('./googleupload').uploadImageToStorage

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
                finalName = file.name
            }

        }else{
            upload_dir = path.join(__dirname, '../../' + UPLOAD_DIR)
        }

        if(!upload_dir || !fs.existsSync(upload_dir)){
            throw new Error(`Upload dir doesn't exist`)
        }


        fs.copyFile(file.path, path.join(upload_dir, finalName), async (err) => {
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

    if( file.type.indexOf('audio/')===0 || file.type.indexOf('video/')===0){

        const ffprobePath = require('@ffprobe-installer/ffprobe').path,
            ffmpeg = require('fluent-ffmpeg')

        ffmpeg.setFfprobePath(ffprobePath)


        const {meta} = await (new Promise((resolve) => {
            ffmpeg.ffprobe(file.path, function(error, meta) {
                if(error){
                    console.warn(error)
                }
                resolve({error,meta})
            })
        }))
        removeInvalidProperties(meta)
        data.info = meta
    }




    const media = {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
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
