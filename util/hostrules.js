// load hostrules
import fs from 'fs'
import path from 'path'
import tls from 'tls'
import config from 'gen/config'

const {HOSTRULES_ABSPATH} = config


const loadHostRules = (dir, withCertContext, hostrules) => {

    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(filename => {
            if (filename.endsWith('.json')) {
                const domainname = filename.substring(0, filename.length - 5),
                    absFilePaht = path.join(dir, filename),
                    stats = fs.statSync(absFilePaht)

                // only read file if it has changed
                if (!hostrules[domainname] || stats.mtime > hostrules[domainname]._lastModified) {

                    const content = fs.readFileSync(absFilePaht)

                    const hostrule = hostrules[domainname] = JSON.parse(content)

                    hostrule._basedir = dir
                    hostrule._lastModified = stats.mtime

                    if (withCertContext) {
                        if (!hostrule.certDir) {
                            hostrule.certDir = '/etc/letsencrypt/live/' + domainname
                        }

                        if (hostrule.certDir) {
                            try {
                                hostrule.certContext = tls.createSecureContext({
                                    key: fs.readFileSync(path.join(hostrule.certDir, './privkey.pem')),
                                    cert: fs.readFileSync(path.join(hostrule.certDir, './cert.pem'))
                                })
                            } catch (e) {
                                console.warn(e.message)
                            }
                        }
                    }
                }
            }
        })
    }
}

export const loadAllHostrules = (withCertContext, hostrules = {}) => {
    console.log('load all host rules')

    loadHostRules(path.join(__dirname, '../hostrules/'), withCertContext, hostrules)
    loadHostRules(HOSTRULES_ABSPATH, withCertContext, hostrules)

    return hostrules
}
