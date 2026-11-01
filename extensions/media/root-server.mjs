import Hook from '../../util/hook.cjs'
import {getServerDb} from "../../api/database.mjs";
import Util from "../../api/util/index.mjs";
import {CAPABILITY_MANAGE_OTHER_USERS} from "../../util/capabilities.mjs";
import {createMatchForCurrentUser} from "../../api/util/dbquery.mjs";
import {ObjectId} from 'mongodb'
import {validateContextUser} from '../../api/util/userSession.mjs'

/*Hook.on('UploadedFileAccess', ({name,filename}) => {
    console.log('UploadedFileAccess', filename)
    // TODO: tracking
})*/

Hook.on('UploadedFilePrivateAccess', async ({name,context}) => {

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