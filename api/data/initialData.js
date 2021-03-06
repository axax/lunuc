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
    CAPABILITY_RUN_COMMAND,
    CAPABILITY_RUN_SCRIPT
} from 'util/capabilities'
import {ObjectId} from 'mongodb'
import path from 'path'
import config from 'gen/config'
import fs from 'fs'
import zipper from 'zip-local'
import Hook from 'util/hook'
import {execSync} from "child_process";
import {MONGO_URL} from '../database'

const {UPLOAD_DIR} = config


// https://github.com/apollographql/apollo-server/issues/1633
ObjectId.prototype.valueOf = function () {
    return this.toString()
}

export const createAllInitialData = async (db) => {
    console.log('Inserting data...')

    const allCollections = await db.listCollections().toArray()

    if (allCollections.length === 0) {
        console.log('Db is completely empty...')

        const dbFile = path.join(__dirname, './initialDb.gz')


        const response = execSync(`mongorestore --nsInclude=lunuc.* --noIndexRestore --uri="${MONGO_URL}" --drop --gzip --archive="${dbFile}"`)
        console.log('restoreDbDump', response)
    }


    await createUserRoles(db)
    await createUsers(db)

    createUploads()
}


export const createUploads = () => {
    const upload_dir = path.join(__dirname, '../../' + UPLOAD_DIR)
    if (Util.ensureDirectoryExistence(upload_dir)) {
        fs.readdir(upload_dir, (err, files) => {
            if (!err && files) {
                const filterdFiles = files.filter(e => e !== '.DS_Store')
                if (filterdFiles.length === 0) {
                    const uploadsZip = path.join(__dirname, './uploads.gz')
                    if (fs.existsSync(uploadsZip)) {
                        console.log('Create upload files...')
                        zipper.sync.unzip(uploadsZip).save(upload_dir)
                    }
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
                CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_COLLECTION, CAPABILITY_MANAGE_OTHER_USERS,
                CAPABILITY_MANAGE_BACKUPS, CAPABILITY_RUN_COMMAND, CAPABILITY_RUN_SCRIPT]
        },
        {
            name: 'editor',
            capabilities: [CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES]
        },
        {
            name: 'author',
            capabilities: [CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE]
        },
        {
            name: 'contributor',
            capabilities: [CAPABILITY_VIEW_APP]
        },
        {
            name: 'subscriber',
            capabilities: [CAPABILITY_VIEW_APP]
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


    const userCollection = db.collection('User')

    if (await userCollection.countDocuments() === 0) {

        console.log('Create users...')

        /* insert admin user */
        await userCollection.updateOne({
            username: 'admin'
        }, {
            $set: {
                role: (await db.collection('UserRole').findOne({name: 'administrator'}))._id,
                emailConfirmed: true,
                requestNewPassword: false,
                email: 'info@lunuc.com',
                username: 'admin',
                password: Util.hashPassword('password')
            }
        }, {upsert: true})

        /* insert anonymous user */
        await userCollection.updateOne({
            username: 'anonymous'
        }, {
            $set: {
                role: (await db.collection('UserRole').findOne({name: 'subscriber'}))._id,
                emailConfirmed: true,
                requestNewPassword: false,
                email: '',
                username: 'anonymous',
                password: Util.hashPassword('password')
            }
        }, {upsert: true})
    }
}
