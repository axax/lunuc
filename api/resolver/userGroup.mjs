import Util from '../util/index.mjs'
import GenericResolver from './generic/genericResolver.mjs'
import {
    CAPABILITY_MANAGE_OTHER_USERS,
    CAPABILITY_MANAGE_USER_GROUP
} from '../../util/capabilities.mjs'
import {ObjectId} from 'mongodb'


export const userGroupResolver = (db) => ({
    Query: {
        userGroups: async ({limit, page, offset, filter, sort}, req) => {
            Util.checkIfUserIsLoggedIn(req.context)
            return await GenericResolver.entities(db, req, 'UserGroup', ['name', 'meta'], {
                limit,
                page,
                offset,
                filter,
                sort
            })
        }
    },
    Mutation: {
        createUserGroup: async ({name, meta, createdBy}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_USER_GROUP)
            return await GenericResolver.createEntity(db, req, 'UserGroup', {name, meta, createdBy})
        },
        updateUserGroup: async ({_id, name, meta, createdBy}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP)

            if(createdBy){

                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            }

            return await GenericResolver.updateEnity(db, context, 'UserGroup', {
                _id,
                name,
                meta,
                createdBy: (createdBy ? new ObjectId(createdBy) : createdBy)
            })


            return {_id, name, meta}

        },
        deleteUserGroup: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP)
            return GenericResolver.deleteEnity(db, context, 'UserGroup', {_id})
        },
        deleteUserGroups: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP)
            return GenericResolver.deleteEnities(db, context, 'UserGroup', {_id})
        }
    }
})
