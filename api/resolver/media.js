import GenericResolver from './generic/genericResolver'
import React from 'react'
import Util from '../util'
import fs from 'fs'
import path from 'path'
import config from 'gen/config'

const {UPLOAD_DIR} = config


export const mediaResolver = (db) => ({
    Query: {
        medias: async ({limit, offset, page, sort, filter}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return await GenericResolver.entities(db, context, 'Media', ['name', 'mimeType', 'src'], {
                limit,
                offset,
                page, sort, filter
            })
        }
    },
    Mutation: {
        createMedia: async ({name, src, mimeType}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            return await GenericResolver.createEnity(db, context, 'Media', {
                name,
                src,
                mimeType
            })
        },
        updateMedia: async ({_id, ...rest}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const result = await GenericResolver.updateEnity(db, context, 'Media', {_id, ...rest})
            return result
        },
        deleteMedia: async ({_id}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const res = await GenericResolver.deleteEnity(db, context, 'Media', {_id})
            if (res.status === 'deleted') {
                // delete file
                const fileName = path.join(__dirname, '../../' + UPLOAD_DIR + '/' + _id)
                console.log('delete file ' + fileName)
                fs.unlinkSync(fileName)
            }
            return res
        }
    }
})

