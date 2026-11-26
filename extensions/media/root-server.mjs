import Hook from '../../util/hook.cjs'
import {getServerDb} from "../../api/database.mjs";
import Util from "../../api/util/index.mjs";
import {CAPABILITY_MANAGE_OTHER_USERS} from "../../util/capabilities.mjs";
import {createMatchForCurrentUser} from "../../api/util/dbquery.mjs";
import {ObjectId} from 'mongodb'
import {validateContextUser} from '../../api/util/userSession.mjs'
import os from 'os'

/*Hook.on('UploadedFileAccess', ({name,filename}) => {
    console.log('UploadedFileAccess', filename)
    // TODO: tracking
})*/

// only for missing files (before they are loaded from another server): only an existing, public media
// may be loaded - not a private one (stored under the public name) and not a deleted one (it would be
// restored by every request). Other files (no media id) are allowed.
Hook.on('UploadedFileFetchAllowed', async ({name}) => {
    if (!/^[0-9a-f]{24}$/.test(name)) {
        return true
    }
    const dbConnection = await getServerDb()
    if (!dbConnection.db) {
        // unknown: better not load it
        return false
    }
    const media = await dbConnection.db.collection('Media').findOne({_id: new ObjectId(name)}, {projection: {private: 1}})
    return !!media && media.private !== true && media.private !== 'true'
})

// a missing upload was restored from the backup server -> entry in the log
Hook.on('UploadedFileFromBackupServer', async ({name, url, filename, isPrivate}) => {
    try {
        const dbConnection = await getServerDb()
        if (dbConnection.db) {
            // directly into the collection: the web server doesn't load the generic resolver
            await dbConnection.db.collection('Log').insertOne({
                location: 'uploads',
                type: 'fileFromBackupServer',
                message: `Missing upload ${name} restored from backup server`,
                meta: {name, url, filename, isPrivate, systemName: os.hostname()},
                modifiedAt: Date.now()
            })
        }
    } catch (e) {
        console.error('UploadedFileFromBackupServer: log entry failed', e.message)
    }
})

Hook.on('UploadedFilePrivateAccess', async ({name,context}) => {

    // only a media id can be a private upload (new ObjectId would throw otherwise)
    if (!ObjectId.isValid(name) || name.length !== 24) {
        return false
    }
    const dbConnection = await getServerDb()
    if(dbConnection.db){
        // blocked / deleted user or password changed since the token was issued
        context = await validateContextUser(dbConnection.db, context, {noCache: true})
        if (!context.id) {
            return false
        }
        const userCanManageOtherUsers = await Util.userHasCapability(dbConnection.db, context, CAPABILITY_MANAGE_OTHER_USERS)
        if(userCanManageOtherUsers){
            // has always access
            return true
        }
        const match = await createMatchForCurrentUser({typeName:'Media', db:dbConnection.db, context})
        match._id = new ObjectId(name)
        const count = await dbConnection.db.collection('Media').countDocuments(
            match,
            { limit: 1 }  // Stops after finding 1 match
        )
        return count>0
    }
    return false
})