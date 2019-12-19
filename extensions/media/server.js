import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import fs from 'fs'
import path from 'path'
import {uploadImageToStorage} from './googleupload'

import config from 'gen/config'
import React from 'react'
import ImageClassfier from './util/imageClassifierLambda'
import {ObjectId} from 'mongodb'
import mediaResolver from './gensrc/resolver'

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

    const _id = ObjectId()

    if( !response.fileIds){
        response.fileIds = []
    }

    response.fileIds.push(_id)

    let uploadResult
    if( data.useCdn ) {
        uploadResult = await uploadImageToStorage({file})
        data.src = uploadResult.url
    }

    if( !uploadResult || uploadResult.error ){
        // fallback
        // store file under the name of the _id
        const upload_dir = path.join(__dirname, '../../' + UPLOAD_DIR)

        fs.copyFile(file.path, path.join(upload_dir, _id.toString()), async (err) => {
            if (err) throw err
            createMediaEntry({db, _id, file, data, context})
        })
    }else{
        createMediaEntry({db, file, data, context, _id})
    }

})



const createMediaEntry = async ({db, _id, file, data, context}) => {
    // const mimeType = MimeType.detectByFileName(file.name)

    // call image classifier if requested
    if (data.classifyImage) {
        data.meta = JSON.stringify(await ImageClassfier.classifyByUrl(data.url || ('http://www.lunuc.com' + UPLOAD_URL + '/' + _id.toString()) )) //)
    }

    const media = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        ...data
    }

    if (_id) {
        media._id = _id
    }

    // save to db
    mediaResolver(db).Mutation.createMedia(media, {context})
}
