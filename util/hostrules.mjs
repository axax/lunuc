// load hostrules
import fs from 'fs'
import path from 'path'
import tls from 'tls'
import config from '../gensrc/config.mjs'

const {HOSTRULES_ABSPATH} = config

const CERT_BASE_DIR = '/etc/letsencrypt/live/'
const certDirs = (domainname) => {
    try {
        return fs.readdirSync(CERT_BASE_DIR, {withFileTypes: true})
            .filter(d => d.isDirectory() && d.name.startsWith(domainname) )
            .map((v) => {
                return {
                    name:v.name,
                    time:fs.statSync(CERT_BASE_DIR + v.name).mtime.getTime()
                }
            })
            .sort((a, b) => {
                return b.time - a.time
            })
    }catch (e) {
        console.log('error reading cert dir', e.message)
    }
    return []
}


const extendHostrulesWithCert = (hostrule, domainname) => {

    let certDir
    const hostsChecks = hostListFromString(hostrule.certDomain || domainname)

    for(const host of hostsChecks ) {
        const dirs = certDirs(host)
        if (dirs.length > 0) {
            certDir = CERT_BASE_DIR + dirs[0].name
            break
        }
    }

    if (certDir) {
        hostrule.certDir = certDir

        const stats = fs.statSync(path.join(hostrule.certDir, './privkey.pem'))

        if(!hostrule.certContext || stats.mtime > hostrule._certLastModified) {

            console.log(`found newest certs for ${hostrule.certDir}`)

            hostrule._certLastModified = stats.mtime
            try {
                hostrule.certContext = tls.createSecureContext({
                    key: fs.readFileSync(path.join(hostrule.certDir, './privkey.pem')),
                    cert: fs.readFileSync(path.join(hostrule.certDir, './fullchain.pem'))
                })
            } catch (e) {
                console.warn(e.message)
            }
        }
    }
}

const loadHostRules = (dir, withCertContext, hostrules, isDefault) => {

    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(filename => {
            if (filename.endsWith('.json')) {
                const domainname = filename.substring(0, filename.length - 5),
                    absFilePaht = path.join(dir, filename),
                    stats = fs.statSync(absFilePaht)

                // only read file if it has changed
                if (!hostrules[domainname] || (!isDefault && stats.mtime > hostrules[domainname]._lastModified)) {

                    const content = fs.readFileSync(absFilePaht)

                    const hostrule = hostrules[domainname] = JSON.parse(content)

                    hostrule._basedir = dir
                    hostrule._lastModified = stats.mtime

                    if(!hostrule.paths){
                        hostrule.paths = []
                    }

                    if (hostrule.botregex) {
                        hostrule.botregex = new RegExp(hostrule.botregex)
                    }
                }

                if (withCertContext) {
                    extendHostrulesWithCert(hostrules[domainname], domainname)
                }
            }
        })

    }
}

const loadAllHostrules = (withCertContext, hostrules = {}, refresh = false) => {
    console.log(`load all host rules from ${HOSTRULES_ABSPATH}`)
    loadHostRules(HOSTRULES_ABSPATH, withCertContext, hostrules)
    if(!refresh) {
        const hostRulePath = path.join(path.resolve(), './hostrules/')
        console.log(`load all host rules from default ${hostRulePath}`)
        loadHostRules(hostRulePath, withCertContext, hostrules, true)
    }

    return hostrules
}

let _loadedHostRules = {},
    _loadedHostRulesTime = 0,
    _loadedHostRulesWithCertContext = false
export const getHostRules =(withCertContext)=>{
    if(_loadedHostRulesTime > 0 &&
        (new Date().getTime() - _loadedHostRulesTime < 60000) &&
        (!withCertContext || _loadedHostRulesWithCertContext)){
        return _loadedHostRules
    }
    loadAllHostrules(_loadedHostRulesWithCertContext || withCertContext, _loadedHostRules,_loadedHostRulesTime > 0 )


    if(withCertContext){
        _loadedHostRulesWithCertContext = true
    }
    _loadedHostRulesTime = new Date().getTime()

    return _loadedHostRules
}


export const hostListFromString = (host) =>{

    const hostList = [host]
    const hostArr = host.split('.')

    while (hostArr.length > 2) {
        hostArr.shift()
        hostList.push(hostArr.join('.'))
    }

    return hostList
}