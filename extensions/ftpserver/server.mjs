import Hook from '../../util/hook.cjs'
import FtpSrv from 'ftp-srv'
import path from 'path'
import {networkInterfaces} from 'os'
import {Netmask} from 'netmask'
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
} from "../../api/util/loginBlocker.mjs";
import {_t} from '../../util/i18nServer.mjs'
//import {getHostRules, hostListFromString} from '../../util/hostrules.mjs'


// open port 21 on your server
// sudo ufw allow 21
// sudo ufw allow 65000:65535/tcp

const ROOT_DIR = path.resolve()
const nets = networkInterfaces()
const getNetworks = () => {
    let networks = {}
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                networks[net.address + "/24"] = net.address
            }
        }
    }
    return networks
}

const resolverFunction = (address) => {
    // const networks = {
    //     '$GATEWAY_IP/32': `${public_ip}`,
    //     '10.0.0.0/8'    : `${lan_ip}`
    // }

   /* const networks = getNetworks()
    for (const network in networks) {
        if (new Netmask(network).contains(address)) {
            console.log('network',network)
            return networks[network]
        }
    }*/
    return '157.173.127.37'//'144.91.119.30' // make it configurable
}


const startFtpServer = (db)=> {

    const hostname = '0.0.0.0'
    const port = 21

    const ftpServer = new FtpSrv({
        url: `ftp://${hostname}:${port}`,
        pasv_url: resolverFunction,
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
        if(hasTooManyInvalidLoginAttempts(ip+':ftp')){
            return reject(new Error(_t('core.login.blocked.temporarily'), 401))
        }

        const ftpUser = await db.collection('FtpUser').findOne({active:true,username: data.username})
        if(ftpUser){
            if (Util.compareWithHashedPassword(data.password, ftpUser.password)) {
                clearInvalidLoginAttempt(ip+':ftp')
                let absdir = path.join(WEBROOT_ABSPATH, ftpUser.root)
                if(ftpUser.root && ftpUser.root.startsWith('@approot/')){
                    absdir = path.join(ROOT_DIR, ftpUser.root.substring(8))
                }

                if(ensureDirectoryExistence(absdir)) {
                    console.log(absdir)
                    return resolve({root: absdir})
                }else{
                    return reject(new Error(`Root dir ${ftpUser.root} for username ${data.username} doesn't exist`, 500))
                }
            }else{
                addInvalidLoginAttempt(ip+':ftp')
            }
        }else{
            addInvalidLoginAttempt(ip+':ftp')
        }


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



// Hook when db is ready
Hook.on('appready', ({db}) => {
    startFtpServer(db)
})
