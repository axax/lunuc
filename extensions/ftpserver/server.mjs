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
//import {getHostRules, hostListFromString} from '../../util/hostrules.mjs'


// open port 21 on your server
// sudo ufw allow 21

const ROOT_DIR = path.resolve()


const startFtpServer = (db)=> {

    const hostname = '0.0.0.0';
    const port = 5000;

    const ftpServer = new FtpSrv({
        url: `ftp://${hostname}:${port}`,
        pasv_url: `ftp://${hostname}:${port}`,
        pasv_min: 65500,
        pasv_max: 65515,
        anonymous: false,
        /*SNICallback: (domain, cb) => {
            if (domain.startsWith('www.')) {
                domain = domain.substring(4)
            }
            const hostsChecks = hostListFromString(domain)
            const hostrules = getHostRules(true)

            for (let i = 0; i < hostsChecks.length; i++) {
                const currentHost = hostsChecks[i]
                const hostrule = hostrules[currentHost]
                if (hostrule && hostrule.certContext) {
                    console.log(`ftp server certContext for ${currentHost}`)
                    cb(null, hostrule.certContext)
                    return
                }
            }
            cb()
        },*/
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
