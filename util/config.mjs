import defaultConfig from '../gensrc/config.mjs'
import fs from 'fs'
import path from 'path'



let configRefreshTimeout = 0, configFileLastMtime = 0

const CURRENT_CONFIG = {...defaultConfig}

function copyObjectAttrs(fromObj, toObj) {
    Object.keys(fromObj).forEach(key => {
        toObj[key] = fromObj[key]
    })
}

export const getDynamicConfig = (refreshOnly) => {

    if((configRefreshTimeout === 0 || refreshOnly) && defaultConfig.CONFIG_ABSPATH) {
        // defaultConfig.CONFIG_ABSPATH
        const configFilePath = path.join(defaultConfig.CONFIG_ABSPATH, 'buildconfig.json')

        let fileStats
        try{
            fileStats = fs.statSync(configFilePath)
        }catch (e) {
        }

        if (fileStats && fileStats.mtime > configFileLastMtime) {
            fs.readFile(configFilePath, 'utf8', (err, data) => {
                if (err){
                    console.error(`Error reading file ${configFilePath}`)
                }else {
                    const jsonObject = JSON.parse(data)
                    console.log(`Refresh dynamic config from ${configFilePath}`)
                    copyObjectAttrs(jsonObject.options, CURRENT_CONFIG)
                }
            })
        }

        clearTimeout(configRefreshTimeout)
        configRefreshTimeout = setTimeout(() => {
            getDynamicConfig(true)
        }, 1000 * 60)
    }

    return CURRENT_CONFIG
}
