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

    hostrule._certLastChecked = Date.now()
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

    if(hostrule.subDomains){
        for (const [key, value] of Object.entries(hostrule.subDomains)) {
            if(value.createSSLCert) {
                extendHostrulesWithCert(value, key)
            }
        }
    }
}


function replaceToRegExp(hostrule) {
    if(!hostrule){
        return
    }
    if (hostrule.botRegex) {
        hostrule.botRegex = new RegExp(hostrule.botRegex, 'i')
    }

    if (hostrule.noJsRenderingBotRegex) {
        hostrule.noJsRenderingBotRegex = new RegExp(hostrule.noJsRenderingBotRegex, 'i')
    }
}

const loadSingleHostrule = ({domainname, hostruleFilePath, isDefault, hostrules, withCertContext}) => {
    const stats = fs.statSync(hostruleFilePath)
    // only read file if it has changed
    if (!hostrules[domainname] || (!isDefault && stats.mtime > hostrules[domainname]._lastModified)) {

        const content = fs.readFileSync(hostruleFilePath)
        let hostrule
        try {
            hostrule = hostrules[domainname] = JSON.parse(content)
        } catch (e) {
            console.warn('Error in hostrule', domainname, e)
        }
        if (hostrule) {
            hostrule._filename = path.basename(hostruleFilePath)
            hostrule._basedir = path.dirname(hostruleFilePath)
            hostrule._lastModified = stats.mtime

            if (!hostrule.paths) {
                hostrule.paths = []
            }
            replaceToRegExp(hostrule)

            if(hostrule.subDomains){
                for(const subDomain of Object.values(hostrule.subDomains)){
                    replaceToRegExp(subDomain)
                }
            }
        }
    }

    if (hostrules[domainname] && withCertContext) {
        extendHostrulesWithCert(hostrules[domainname], domainname)
    }
}

const loadHostRules = (dir, withCertContext, hostrules, isDefault) => {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(filename => {
            if (filename.endsWith('.json')) {
                const domainname = filename.substring(0, filename.length - 5),
                    hostruleFilePath = path.join(dir, filename)

                loadSingleHostrule({domainname, hostruleFilePath, isDefault, hostrules, withCertContext})
            }
        })

    }
}

const loadAllHostrules = (withCertContext, hostrules = {}, refresh = false) => {
    console.debug(`Hostrules: load all rules from ${HOSTRULES_ABSPATH}`)
    loadHostRules(HOSTRULES_ABSPATH, withCertContext, hostrules)
    if(!refresh) {
        const hostRulePath = path.join(path.resolve(), './hostrules/')
        console.debug(`Hostrules: load all rules from default ${hostRulePath}`)
        loadHostRules(hostRulePath, withCertContext, hostrules, true)
    }

    return hostrules
}

let _loadedHostRules = {},
    _loadedHostRulesTime = {all:0},
    _loadedHostRulesWithCertContext = false
export const getHostRules =(withCertContext, hostToCheck)=>{

    if(_loadedHostRulesTime.all > 0) {
        if (hostToCheck &&
            !_loadedHostRules[hostToCheck] &&
            (!_loadedHostRulesTime[hostToCheck] || new Date().getTime() - _loadedHostRulesTime[hostToCheck] < 20000)) {

            const hostruleFilePath = path.join(HOSTRULES_ABSPATH, hostToCheck + '.json')

            if (fs.existsSync(hostruleFilePath)) {
                // newly created hostrules
                console.debug(`Hostrules: load single rule for ${hostToCheck}`)
                loadSingleHostrule({
                    isDefault: false,
                    domainname: hostToCheck,
                    hostruleFilePath,
                    hostrules: _loadedHostRules,
                    withCertContext
                })
            }
            return _loadedHostRules
        } else if ((new Date().getTime() - _loadedHostRulesTime.all < 60000) &&
            (!withCertContext || _loadedHostRulesWithCertContext)) {

            if(withCertContext && _loadedHostRules[hostToCheck] &&
                !_loadedHostRules[hostToCheck]._certLastChecked) {
                extendHostrulesWithCert(_loadedHostRules[hostToCheck], hostToCheck)
            }

            return _loadedHostRules
        }
    }
    loadAllHostrules(_loadedHostRulesWithCertContext || withCertContext, _loadedHostRules,_loadedHostRulesTime.all > 0 )


    if(withCertContext){
        _loadedHostRulesWithCertContext = true
    }
    _loadedHostRulesTime.all = new Date().getTime()

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

/*console.log(hostListFromString('main.onyou.ch'))
console.log(hostListFromString('www.onyou.ch'))*/

export const getBestMatchingHostRule = (host, withCertContext=true, fallbackToGeneral = false) => {
    let hostrules = getHostRules(withCertContext, host)
    const hostsChecks = hostListFromString(host)
    for (let i = 0; i < hostsChecks.length; i++) {
        const currentHost = hostsChecks[i]
        const hostrule = hostrules[currentHost]
        if (hostrule) {
            if(withCertContext) {
                // check again with current host in case cert was not loaded before
                hostrules = getHostRules(withCertContext, currentHost)
            }

            if(hostrule.subDomains && hostrule.subDomains[host]){
                return {hostrule: {...hostrule,...hostrule.subDomains[host],_subDomain:host}, host: currentHost, _exactMatch:true}
            }
            return {hostrule, host: currentHost, _exactMatch: currentHost === host || host === 'www.' + currentHost}
        }
    }
    if(fallbackToGeneral){
        return {hostrule: hostrules.general, host}
    }
    return {}
}

let secureContext

const readFileByNames = (baseDir, fileNames) => {
    let fileContent
    for (const name of fileNames) {
        const filePath = path.join(baseDir, `./${name}`)
        if (fs.existsSync(filePath)) {
            fileContent = fs.readFileSync(filePath)
            continue
        }
    }
    return fileContent
}

export const getRootCertContext = () => {
    if(secureContext){
        return secureContext
    }
    const SERVER_DIR = path.join(path.resolve(), './server'),
    DEFAULT_CERT_DIR = process.env.LUNUC_CERT_DIR || SERVER_DIR

    let pkey = readFileByNames(DEFAULT_CERT_DIR, ['privkey.pem','RootCA.key'] )
    let cert = readFileByNames(DEFAULT_CERT_DIR, ['cert.pem','RootCA.pem'] )

    secureContext = tls.createSecureContext({
        key: pkey,
        cert
    })

    return secureContext
}