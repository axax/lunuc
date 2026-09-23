// load hostrules
import fs from 'fs'
import path from 'path'
import tls from 'tls'
import config from '../gensrc/config.mjs'
import {getRegexCached} from '../server/util/regexCache.mjs'

const {HOSTRULES_ABSPATH} = config

const CERT_BASE_DIR = '/etc/letsencrypt/live/'

// Memo for the duration of ONE loadAllHostrules run: the cert base dir is
// otherwise read (readdirSync) once per hostrule and the same dirs stat'ed
// repeatedly - all synchronous on the event loop. Only successful results are
// memoized, errors behave exactly as before (thrown/caught per call).
let certDirMemo = null // {entries: Dirent[]|undefined, mtimes: Map<name, number>}

const readCertBaseDir = () => {
    if (certDirMemo && certDirMemo.entries) {
        return certDirMemo.entries
    }
    const entries = fs.readdirSync(CERT_BASE_DIR, {withFileTypes: true})
    if (certDirMemo) {
        certDirMemo.entries = entries
    }
    return entries
}

const certDirMtime = (name) => {
    if (certDirMemo) {
        const cached = certDirMemo.mtimes.get(name)
        if (cached !== undefined) {
            return cached
        }
    }
    const time = fs.statSync(CERT_BASE_DIR + name).mtime.getTime()
    if (certDirMemo) {
        certDirMemo.mtimes.set(name, time)
    }
    return time
}

const certDirs = (domainname) => {
    try {
        return readCertBaseDir()
            .filter(d => d.isDirectory() && d.name.startsWith(domainname) )
            .map((v) => {
                return {
                    name:v.name,
                    time:certDirMtime(v.name)
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
        hostrule.botRegex = getRegexCached(hostrule.botRegex)
    }

    if (hostrule.noJsRenderingBotRegex) {
        hostrule.noJsRenderingBotRegex = getRegexCached(hostrule.noJsRenderingBotRegex)
    }
}

const DEFAULT_SLUG_FALLBACK_EXCEPTIONS= [
    "core/qrcode",
    "system/responsive-viewer",
    "system/hostrules",
    "system/console",
    "system/aiassistent",
    "system/ask",
    "system/mailclient"
]

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

            // normaliue slugFallback
            if(hostrule.slugFallback===true) {
                hostrule.slugFallback = {default: true}
            }else if(hostrule?.slugFallback?.constructor !== Object) {
                hostrule.slugFallback = {default: false}
            }

            if(!hostrule.slugFallback.exceptions) {
                hostrule.slugFallback.exceptions = [...DEFAULT_SLUG_FALLBACK_EXCEPTIONS]
            }else if(hostrule.slugFallback.extendWithDefaults) {
                hostrule.slugFallback.exceptions = [
                    ...new Set([...hostrule.slugFallback.exceptions, ...DEFAULT_SLUG_FALLBACK_EXCEPTIONS])
                ]
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
    certDirMemo = {entries: undefined, mtimes: new Map()}
    try {
        console.debug(`Hostrules: load all rules from ${HOSTRULES_ABSPATH}`)
        loadHostRules(HOSTRULES_ABSPATH, withCertContext, hostrules)
        if(!refresh) {
            const hostRulePath = path.join(path.resolve(), './hostrules/')
            console.debug(`Hostrules: load all rules from default ${hostRulePath}`)
            loadHostRules(hostRulePath, withCertContext, hostrules, true)
        }
    } finally {
        certDirMemo = null
    }

    return hostrules
}

// Negative cache for hosts WITHOUT an own hostrule file (e.g. www.example.ch when
// the rule is example.ch.json, ip hosts, random bot hosts). Previously every such
// request (and every TLS handshake via SNICallback) did a blocking fs.existsSync.
// The hostrules dir watcher below clears the cache as soon as anything changes
// there, so newly created hostrule files are still picked up immediately; the
// TTL is only the fallback if the watcher cannot be started.
const MISSING_HOSTRULE_TTL_MS = 20000
const MISSING_HOSTRULE_MAX = 10000
const missingHostruleChecks = new Map() // host -> time of last negative check


/* ------------------------------------------------------------------ */
/* Change detection: watchers instead of polling                        */
/* ------------------------------------------------------------------ */

// Previously every getHostRules call older than 60s triggered a full
// synchronous reload (all hostrule files + all cert dirs), just to notice
// changes. Now two watchers mark the loaded rules as dirty and the reload
// only happens when something actually changed:
//   - HOSTRULES_ABSPATH: new/changed hostrule files
//   - CERT_BASE_DIR (recursive): new/renewed letsencrypt certs
// The reload itself is exactly the same code path as before (lazy, inside
// getHostRules), only the trigger changed. If a watcher cannot be started or
// fails later, the old 60s interval is used again for what it covers.
// A long safety interval covers missed events (e.g. inotify queue overflow).
const RELOAD_INTERVAL_MS = 60000               // old behaviour / fallback
const RELOAD_SAFETY_INTERVAL_MS = 10 * 60000   // with working watchers

let hostrulesWatchState = 'none' // 'none' | 'active' | 'failed'
let certWatchState = 'none'
let hostrulesDirty = false
let certsDirty = false

const startWatcher = (dir, options, onChange, onFail) => {
    try {
        const watcher = fs.watch(dir, options, onChange)
        watcher.on('error', (e) => {
            console.warn(`Hostrules: watcher for ${dir} failed (${e.message}) - falling back to interval`)
            try { watcher.close() } catch (err) {}
            onFail()
        })
        // must never keep the process alive (module is used by scripts too)
        watcher.unref()
        return true
    } catch (e) {
        return false
    }
}

// the cert watcher is only needed by processes that actually load certs
// (the web server) - api/cms processes call getHostRules without them
const ensureWatchers = (withCerts) => {
    if (hostrulesWatchState === 'none') {
        hostrulesWatchState = startWatcher(HOSTRULES_ABSPATH, {}, () => {
            missingHostruleChecks.clear()
            hostrulesDirty = true
        }, () => {
            missingHostruleChecks.clear()
            hostrulesDirty = true
            hostrulesWatchState = 'failed'
        }) ? 'active' : 'failed'
    }
    if (withCerts && certWatchState === 'none') {
        certWatchState = startWatcher(CERT_BASE_DIR, {recursive: true}, () => {
            certsDirty = true
        }, () => {
            certsDirty = true
            certWatchState = 'failed'
        }) ? 'active' : 'failed'
    }
}

// true if the loaded rules must be reloaded (replaces the plain 60s check)
const isReloadDue = (now) => {
    const age = now - _loadedHostRulesTime.all
    if (hostrulesWatchState !== 'active') {
        return age >= RELOAD_INTERVAL_MS // hostrule files not watched -> old behaviour
    }
    if (_loadedHostRulesWithCertContext && certWatchState !== 'active') {
        return age >= RELOAD_INTERVAL_MS // certs not watched -> old behaviour
    }
    return hostrulesDirty ||
        (_loadedHostRulesWithCertContext && certsDirty) ||
        age >= RELOAD_SAFETY_INTERVAL_MS
}

let _loadedHostRules = {},
    _loadedHostRulesTime = {all:0},
    _loadedHostRulesWithCertContext = false
export const resetHostRules = () => {
    missingHostruleChecks.clear()
    _loadedHostRules = {}
    _loadedHostRulesTime = {all:0}
    _loadedHostRulesWithCertContext = false
}
export const getHostRules =(withCertContext, hostToCheck)=>{

    if(_loadedHostRulesTime.all > 0) {
        if (hostToCheck &&
            !_loadedHostRules[hostToCheck] &&
            (!_loadedHostRulesTime[hostToCheck] || new Date().getTime() - _loadedHostRulesTime[hostToCheck] < 20000)) {

            ensureWatchers(false)
            const now = Date.now()
            const lastMiss = missingHostruleChecks.get(hostToCheck)

            if (lastMiss === undefined || now - lastMiss >= MISSING_HOSTRULE_TTL_MS) {
                const hostruleFilePath = path.join(HOSTRULES_ABSPATH, hostToCheck + '.json')

                if (fs.existsSync(hostruleFilePath)) {
                    missingHostruleChecks.delete(hostToCheck)
                    // newly created hostrules
                    console.debug(`Hostrules: load single rule for ${hostToCheck}`)
                    loadSingleHostrule({
                        isDefault: false,
                        domainname: hostToCheck,
                        hostruleFilePath,
                        hostrules: _loadedHostRules,
                        withCertContext
                    })
                } else {
                    if (missingHostruleChecks.size >= MISSING_HOSTRULE_MAX) {
                        missingHostruleChecks.clear()
                    }
                    missingHostruleChecks.set(hostToCheck, now)
                }
            }
            return _loadedHostRules
        } else if (!isReloadDue(Date.now()) &&
            (!withCertContext || _loadedHostRulesWithCertContext)) {
            return _loadedHostRules
        }
    }
    ensureWatchers(_loadedHostRulesWithCertContext || withCertContext)
    // reset BEFORE loading: events fired during the (synchronous) load are
    // delivered afterwards and correctly mark the rules dirty again
    hostrulesDirty = false
    certsDirty = false
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