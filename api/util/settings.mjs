import Util from './index.mjs'


const settingRefreshTimeout = {}
export const dynamicSettings = async ({db, context, key, settings, timeout}) => {
    const newSettings = (await Util.getKeyValueGlobal(db, context, key, true)) || {}
    Object.keys(newSettings).forEach(key=>{
        settings[key] = newSettings[key]
    })
    clearTimeout(settingRefreshTimeout[key])
    settingRefreshTimeout[key] = setTimeout(()=>{
        dynamicSettings({db,context,key,settings,timeout})
    },timeout || 1000*60)
}