import Hook from '../../util/hook.cjs'
import FtpSrv from 'ftp-srv'
import path from 'path'
import config from 'gen/config'
import Util from '../../api/util/index.mjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
const {WEBROOT_ABSPATH} = config
import {ensureDirectoryExistence} from '../../util/fileUtil.mjs'

const ROOT_DIR = path.resolve()

const startFtpServer = (db)=> {


    const port = 21
    const ftpServer = new FtpSrv({
        url: 'ftp://0.0.0.0:' + port,
        anonymous: false,
        greeting: [`${config.APP_NAME} ${config.APP_VERSION}`]
    })

    ftpServer.on('login', async (data, resolve, reject) => {

        const ftpUser = await db.collection('FtpUser').findOne({active:true,username: data.username})
        if(ftpUser){
            if (Util.compareWithHashedPassword(data.password, ftpUser.password)) {
                let absdir = path.join(WEBROOT_ABSPATH, ftpUser.root)
                if(ftpUser.root && ftpUser.root.startsWith('@approot/')){
                    absdir = path.join(ROOT_DIR, ftpUser.root.substring(8))
                }

                if(ensureDirectoryExistence(absdir)) {
                    console.log(absdir)
                    return resolve({root: absdir})
                }
            }
        }


        return reject(new Error('Invalid username or password', 401))
    })

    ftpServer.listen().then(() => {
        console.log('Ftp server is starting...')
    })
}

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})



// Hook when db is ready
Hook.on('appready', ({db}) => {
    startFtpServer(db)
})
