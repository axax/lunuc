import Util from '../util'
import GenericResolver from './generic/genericResolver'
import {
    CAPABILITY_MANAGE_USER_GROUP
} from 'util/capabilities'


export const userGroupResolver = (db) => ({
    Query: {
        userGroups: async ({limit, page, offset, filter, sort}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return await GenericResolver.entities(db, context, 'UserGroup', ['name'], {
                limit,
                page,
                offset,
                filter,
                sort
            })
        }
    },
    Mutation: {
        createUserGroup: async ({name}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_USER_GROUP)
            return await GenericResolver.createEntity(db, req, 'UserGroup', {name})
        },
        updateUserGroup: async ({_id, name}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP)

            return await GenericResolver.updateEnity(db, context, 'UserGroup', {
                _id,
                name
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
