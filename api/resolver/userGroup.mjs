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
            return await GenericResolver.entities(db, req, 'UserGroup', ['name'], {
                limit,
                page,
                offset,
                filter,
                sort
            })
        }
    },
    Mutation: {
        createUserGroup: async ({name, createdBy}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_USER_GROUP)
            return await GenericResolver.createEntity(db, req, 'UserGroup', {name, createdBy})
        },
        updateUserGroup: async ({_id, name, createdBy}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP)

            if(createdBy){

                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            }

            return await GenericResolver.updateEnity(db, context, 'UserGroup', {
                _id,
                name,
                createdBy: (createdBy ? new ObjectId(createdBy) : createdBy)
            })


            return {_id, name}

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
