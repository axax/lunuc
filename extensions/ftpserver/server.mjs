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
import {
    addInvalidLoginAttempt,
    clearInvalidLoginAttempt,
    hasTooManyInvalidLoginAttempts
} from '../../api/util/loginBlocker.mjs'
import {_t} from '../../util/i18nServer.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'
import {isExtensionEnabled} from '../../gensrc/extensions-private.mjs'

//import {getHostRules, hostListFromString} from '../../util/hostrules.mjs'


// open port 21 on your server
// sudo ufw allow 21
// sudo ufw allow 65000:65535/tcp

const ROOT_DIR = path.resolve()

// Per-username lockout is intentionally more lenient than the per-IP
// lockout (loginBlocker.mjs uses MAX_LOGIN_ATTEMPTS=10 / 180s). Locking a
// specific username too aggressively turns into its own vulnerability: an
// attacker who merely knows a valid username (not the password) could
// deny that legitimate user access by deliberately failing logins against
// it. This is a coarser, longer-window safety net mainly meant to slow
// down credential-guessing attacks that rotate the SOURCE IP but keep
// trying the same known/guessed username (e.g. guessing LUNUC_SUPER_PASSWORD
// against a fixed username from many different IPs, which the per-IP
// lockout alone would not catch).
const usernameKey = (username) => `ftpuser:${username}`
// Deliberately more lenient than loginBlocker's per-IP default (10 / 180s):
// more attempts allowed, and a longer window, so a legitimate user who
// mistypes their password a few times isn't locked out by this secondary
// check - the per-IP lockout above still catches fast brute-forcing from a
// single source.
const USERNAME_LOCKOUT_OPTIONS = {maxAttempts: 20, delayInSec: 900}

const startFtpServer = async (db)=> {

    const hostname = '0.0.0.0'
    const port = 21
    const ftpServer = new FtpSrv({
        url: `ftp://${hostname}:${port}`,
        pasv_url: await getGatewayIp(),
        pasv_min: 65000,
        pasv_max: 65535,
        anonymous: false,
        timeout:0,
        /*SNICallback: (domain, cb) => {
            console.log('ftp SNICallback',domain)
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

    ftpServer.on('client-error', async ({connection, context, error}) => {
        console.log('ftp client-error',error,context)
    })
    ftpServer.on('server-error', async ({error}) => {
        console.log('ftp client-error',error)
    })

    ftpServer.on('login', async (data, resolve, reject) => {
        const ip= data.connection.ip
        const userKey = usernameKey(data.username)

        if(hasTooManyInvalidLoginAttempts(ip+':ftp')){
            console.warn(`[AUDIT] ftp login blocked (too many attempts for ip) - ip=${ip} username=${data.username} - ${new Date().toISOString()}`)
            return reject(new Error(_t('core.login.blocked.temporarily'), 401))
        }

        if(hasTooManyInvalidLoginAttempts(userKey, USERNAME_LOCKOUT_OPTIONS)){
            console.warn(`[AUDIT] ftp login blocked (too many attempts for username) - ip=${ip} username=${data.username} - ${new Date().toISOString()}`)
            return reject(new Error(_t('core.login.blocked.temporarily'), 401))
        }

        const ftpUser = await db.collection('FtpUser').findOne({active:true,username: data.username})
        if(ftpUser){
            if (Util.compareWithHashedPassword(data.password, ftpUser.password)) {
                clearInvalidLoginAttempt(ip+':ftp')
                clearInvalidLoginAttempt(userKey)

                let absdir = path.join(WEBROOT_ABSPATH, ftpUser.root)
                if(ftpUser.root && ftpUser.root.startsWith('@approot/')){
                    absdir = path.join(ROOT_DIR, ftpUser.root.substring(8))
                }

                if(ftpUser.root && ftpUser.root.startsWith('@upload/')){
                    absdir = path.join(config.UPLOAD_DIR_ABSPATH, ftpUser.root.substring(7))
                }

                if(ftpUser.root && ftpUser.root.startsWith('@backup/')){
                    absdir = path.join(path.join(ROOT_DIR, config.BACKUP_DIR), ftpUser.root.substring(7))
                }

                if(ensureDirectoryExistence(absdir, true)) {
                    // Successful logins were previously not logged at all -
                    // only failed attempts fed into the rate limiter. Without
                    // this, a successful (possibly unauthorized) login left
                    // zero trace to investigate after the fact.
                    console.log(`[AUDIT] ftp login success - ip=${ip} username=${data.username} root=${absdir} - ${new Date().toISOString()}`)
                    return resolve({root: absdir})
                }else{
                    return reject(new Error(`Root dir ${ftpUser.root} for username ${data.username} doesn't exist`, 500))
                }
            }else{
                addInvalidLoginAttempt(ip+':ftp')
                addInvalidLoginAttempt(userKey)
            }
        }else{
            addInvalidLoginAttempt(ip+':ftp')
            // Deliberately NOT calling addInvalidLoginAttempt(userKey) here:
            // the username doesn't exist, so tracking it would let an
            // attacker fill the lockout map with usernames that were never
            // real accounts (see loginBlocker.mjs's own cap/sweep for the
            // memory-growth angle - this avoids adding to that pressure for
            // a case that isn't a real account anyway).
        }

        console.warn(`[AUDIT] ftp login failed - ip=${ip} username=${data.username} - ${new Date().toISOString()}`)
        return reject(new Error(`Invalid username ${data.username} or password from ${ip}`, 401))
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

if(isExtensionEnabled('dns')){
    Hook.on('dnsready', async ({db}) => {
        await startFtpServer(db)
    })
}else {
    // Hook when db is ready
    Hook.on('appready', async ({db}) => {
        await startFtpServer(db)
    })
}