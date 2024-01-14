import Util from '../util/index.mjs'
import {
    CAPABILITY_VIEW_APP,
    CAPABILITY_ACCESS_ADMIN_PAGE,
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_KEYVALUES,
    CAPABILITY_MANAGE_OTHER_USERS,
    CAPABILITY_MANAGE_SAME_GROUP,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_MANAGE_USER_ROLE,
    CAPABILITY_MANAGE_USER_GROUP,
    CAPABILITY_RUN_COMMAND,
    CAPABILITY_RUN_SCRIPT,
    CAPABILITY_BULK_EDIT_SCRIPT,
    CAPABILITY_SET_INITIAL_PASSWORD,
    CAPABILITY_BULK_EDIT, CAPABILITY_EXTRA_OPTIONS, CAPABILITY_ADMIN_OPTIONS
} from '../../util/capabilities.mjs'
import {ObjectId} from 'mongodb'
import path from 'path'
import config from '../../gensrc/config.mjs'
import fs from 'fs'
import zipper from 'zip-local'
import Hook from '../../util/hook.cjs'
import {execSync} from 'child_process'
import {MONGO_URL} from '../database.mjs'

const {UPLOAD_DIR} = config


// https://github.com/apollographql/apollo-server/issues/1633
ObjectId.prototype.valueOf = function () {
    return this.toString()
}

export const createAllInitialData = async (db) => {
    console.log(`Inserting initial data if necessary... ${new Date() - _app_.start}ms`)

    //const stats = await db.stats()
    const collectionNames = await db.listCollections({}, { nameOnly: true }).toArray()
    console.log(`Number of collections in db ${collectionNames.length} ${new Date() - _app_.start}ms`)

    if (collectionNames.length === 0) {
        console.log('Db is completely empty...')

        const dbFile = path.join(path.resolve(), './api/data/initialDb.gz')


        const response = execSync(`mongorestore --nsInclude=lunuc.* --noIndexRestore --uri="${MONGO_URL}" --drop --gzip --archive="${dbFile}"`)
        console.log('restoreDbDump', response)
    }


    await createUsers(db)

    createUploads()
}


export const createUploads = () => {
    const upload_dir = path.join(path.resolve(), UPLOAD_DIR)
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
    console.log(`Creating or updating user roles... ${new Date() - _app_.start}ms`)

    const userRoles = [
        {
            prettyName: {de: 'Administrator', en: 'Administrator'},
            name: 'administrator',
            capabilities: [CAPABILITY_VIEW_APP, CAPABILITY_MANAGE_USER_ROLE, CAPABILITY_MANAGE_USER_GROUP,
                CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES, CAPABILITY_MANAGE_SAME_GROUP,
                CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_COLLECTION,
                CAPABILITY_BULK_EDIT_SCRIPT, CAPABILITY_BULK_EDIT, CAPABILITY_SET_INITIAL_PASSWORD,
                CAPABILITY_MANAGE_OTHER_USERS,
                CAPABILITY_MANAGE_BACKUPS, CAPABILITY_RUN_COMMAND, CAPABILITY_RUN_SCRIPT, CAPABILITY_EXTRA_OPTIONS, CAPABILITY_ADMIN_OPTIONS]
        },
        {
            prettyName: {de: 'Editor', en: 'Editor'},
            name: 'editor',
            capabilities: [CAPABILITY_BULK_EDIT, CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_COLLECTION, CAPABILITY_MANAGE_SAME_GROUP, CAPABILITY_SET_INITIAL_PASSWORD, CAPABILITY_EXTRA_OPTIONS]
        },
        {
            prettyName: {de: 'Author', en: 'Author'},
            name: 'author',
            capabilities: [CAPABILITY_BULK_EDIT, CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_SAME_GROUP, CAPABILITY_SET_INITIAL_PASSWORD]
        },
        {
            prettyName: {de: 'Contributor', en: 'Contributor'},
            name: 'contributor',
            capabilities: [CAPABILITY_VIEW_APP]
        },
        {
            prettyName: {de: 'Abonnent', en: 'Subscriber'},
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
                $set: {prettyName: userRole.prettyName},
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

    if (await userCollection.estimatedDocumentCount() === 0) {

        await createUserRoles(db)

        console.log(`Create users... ${new Date() - _app_.start}ms`)

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
    }else{
        // without await
        createUserRoles(db)
    }
}
