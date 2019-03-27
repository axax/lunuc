import Util from '../util'
import {
    CAPABILITY_VIEW_APP,
    CAPABILITY_ACCESS_ADMIN_PAGE,
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_KEYVALUES,
    CAPABILITY_MANAGE_OTHER_USERS,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_MANAGE_USER_ROLE,
    CAPABILITY_READ_EVERYTHING,
    CAPABILITY_RUN_COMMAND
} from 'util/capabilities'
import {ObjectId} from 'mongodb'
import path from 'path'
import config from 'gen/config'
import fs from 'fs'
import zipper from 'zip-local'
import Hook from 'util/hook'

const {UPLOAD_DIR} = config


// https://github.com/apollographql/apollo-server/issues/1633
ObjectId.prototype.valueOf = function () {
    return this.toString()
}

export const createAllInitialData = async (db) => {
    console.log('Inserting data...')
    await createUserRoles(db)
    await createUsers(db)
    createUploads()
}



export const createUploads = () => {
    const upload_dir = path.join(__dirname, '../../' + UPLOAD_DIR)
    if (Util.ensureDirectoryExistence(upload_dir)) {
        fs.readdir(upload_dir, (err, files) => {
            if (!err && files) {
                const filterdFiles = files.filter(e => !e === '.DS_Store')
                if (filterdFiles.length === 0) {
                    console.log('Create upload files...')
                    zipper.sync.unzip(path.join(__dirname, './uploads.gz')).save(upload_dir)
                }
            }
        })
    }

}


export const createUserRoles = async (db) => {
    const userRoles = [
        {
            name: 'administrator',
            capabilities: [CAPABILITY_VIEW_APP, CAPABILITY_MANAGE_USER_ROLE,
                CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES,
                CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_COLLECTION, CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_MANAGE_BACKUPS, CAPABILITY_RUN_COMMAND]
        },
        {
            name: 'contributor',
            capabilities: [CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES]
        },
        {
            name: 'subscriber',
            capabilities: [CAPABILITY_VIEW_APP]
        },
        {
            name: 'demo',
            capabilities: [CAPABILITY_VIEW_APP, CAPABILITY_READ_EVERYTHING, CAPABILITY_ACCESS_ADMIN_PAGE]
        }
    ]

    Hook.call('createUserRoles', {userRoles, db})

    const userRoleCollection = await db.collection('UserRole')

    for (const userRole of userRoles) {
        await userRoleCollection.updateOne(
            {name: userRole.name},
            {
                $addToSet: {
                    capabilities: {
                        $each: userRole.capabilities
                    }
                }
            },
            {
                upsert: true
            }
        )
    }
}

export const createUsers = async (db) => {


    console.log('Create users...')
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