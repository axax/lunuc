import Hook from '../../util/hook.cjs'
import {dbConnectionCached, MONGO_URL} from "../../api/database.mjs";
import Util from "../../api/util/index.mjs";
import {CAPABILITY_MANAGE_OTHER_USERS} from "../../util/capabilities.mjs";
import {createMatchForCurrentUser} from "../../api/util/dbquery.mjs";
import {ObjectId} from 'mongodb'

/*Hook.on('UploadedFileAccess', ({name,filename}) => {
    console.log('UploadedFileAccess', filename)
    // TODO: tracking
})*/

Hook.on('UploadedFilePrivateAccess', async ({name,context}) => {

    const dbConnection = await (new Promise((resolve) => {
        dbConnectionCached(MONGO_URL, 'server',async (err, db) => {
            resolve({err,db})
        })
    }))
    if(dbConnection.db){
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