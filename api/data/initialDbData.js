import Util from '../util'
import {
    CAPABILITY_VIEW_APP,
    CAPABILITY_ACCESS_ADMIN_PAGE,
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_KEYVALUES,
    CAPABILITY_MANAGE_OTHER_USERS,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_READ_EVERYTHING,
    CAPABILITY_RUN_COMMAND
} from 'util/capabilities'

import {ObjectId} from 'mongodb'

// https://github.com/apollographql/apollo-server/issues/1633
ObjectId.prototype.valueOf = function () {
    return this.toString()
}

export const createAllInitialData = async (db) => {
    console.log('Inserting data...')
    await createUserRoles(db)
    await createUsers(db)
}


export const createUserRoles = async (db) => {
    const userRoleCollection = db.collection('UserRole')
    userRoleCollection.updateOne(
        {name: 'administrator'},
        {
            $addToSet: {
                capabilities: {
                    $each: [CAPABILITY_VIEW_APP,
                        CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES, CAPABILITY_MANAGE_CMS_PAGES,
                        CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_COLLECTION, CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_RUN_COMMAND]
                }
            }
        },
        {
            upsert: true
        }
    )

    userRoleCollection.updateOne(
        {name: 'contributor'},
        {$addToSet: {capabilities: {$each: [CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES, CAPABILITY_MANAGE_CMS_PAGES]}}},
        {
            upsert: true
        }
    )

    userRoleCollection.updateOne(
        {name: 'subscriber'},
        {$addToSet: {capabilities: {$each: [CAPABILITY_VIEW_APP]}}},
        {
            upsert: true
        }
    )


    userRoleCollection.updateOne(
        {name: 'demo'},
        {$addToSet: {capabilities: {$each: [CAPABILITY_VIEW_APP, CAPABILITY_READ_EVERYTHING, CAPABILITY_ACCESS_ADMIN_PAGE]}}},
        {
            upsert: true
        }
    )

}

export const createUsers = async (db) => {

    const userCollection = db.collection('User')

    if (userCollection.countDocuments()) {
        const userRole = (await db.collection('UserRole').findOne({name: 'administrator'}))

        const insertResult = await userCollection.updateOne({
            username: 'admin'
        }, {
            $set: {
                role: userRole._id,
                emailConfirmed: false,
                email: 'axax@gmx.net',
                username: 'admin',
                password: Util.hashPassword('password')
            }
        }, {upsert: true})
    }
}