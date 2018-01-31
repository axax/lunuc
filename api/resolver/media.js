import GenericResolver from './generic/genericResolver'
import React from 'react'
import Util from '../util'

export const mediaResolver = (db) => ({
    medias: async ({limit, offset, page, sort, filter}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return await GenericResolver.entities(db, context, 'Media', ['name', 'src'], {
            limit,
            offset,
            page, sort, filter
        })
    },
    createMedia: async ({name, src}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        return await GenericResolver.createEnity(db, context, 'Media', {
            name,
            src
        })
    },
    updateMedia: async ({_id, ...rest}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        const result = await GenericResolver.updateEnity(db, context, 'Media', {_id, ...rest})
        return result
    },
    deleteMedia: async ({_id}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return GenericResolver.deleteEnity(db, context, 'Media', {_id})
    }
})

