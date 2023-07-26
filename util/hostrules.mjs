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

export const hostListFromString = (host) =>{

    const hostList = [host]
    const hostArr = host.split('.')

    while (hostArr.length > 2) {
        hostArr.shift()
        hostList.push(hostArr.join('.'))
    }

    return hostList
}

export const extendHostruelWithCert = (hostrule, domainname) => {
    if (!hostrule.certDir) {

        const hostsChecks = hostListFromString(domainname)

        for(const host of hostsChecks ) {
            const dirs = certDirs(host)
            if (dirs.length > 0) {
                hostrule.certDir = CERT_BASE_DIR + dirs[0].name
                console.log(` found newest certs for ${host} in ${hostrule.certDir}`)
                break
            }
        }
        // hostrule.certDir = '/etc/letsencrypt/live/' + domainname
    }

    if (hostrule.certDir) {


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

                    if (hostrule.botregex) {
                        hostrule.botregex = new RegExp(hostrule.botregex)
                    }

                    if (withCertContext) {
                        extendHostruelWithCert(hostrule, domainname)
                    }
                }
            }
        })

    }
}

export const loadAllHostrules = (withCertContext, hostrules = {}, refresh) => {
    console.log(`load all host rules from ${HOSTRULES_ABSPATH}`)
    loadHostRules(HOSTRULES_ABSPATH, withCertContext, hostrules)
    if(!refresh) {
        const hostRulePath = path.join(path.resolve(), './hostrules/')
        console.log(`load all host rules from default ${hostRulePath}`)
        loadHostRules(hostRulePath, withCertContext, hostrules, true)
    }

    return hostrules
}
