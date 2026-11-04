/*
 * Versions of a type are copies of its collection: <Type>_<timestamp>[_<name>]
 * (api/resolver/system.mjs cloneCollection). The version value is everything after "<Type>_",
 * the one that is live is stored in KeyValueGlobal TypesSelectedVersions[<Type>] (missing or 'default' = <Type>).
 */

export const DEFAULT_VERSION = 'default'

export const parseCollectionVersion = (type, collectionName) => {
    const value = collectionName.substring(type.length + 1)
    const sep = value.indexOf('_')
    const timestamp = sep >= 0 ? value.substring(0, sep) : value
    // all underscores: a name "Relaunch_2027" is stored as "Relaunch_2027" (only the first one was replaced)
    const name = sep >= 0 ? value.substring(sep + 1).replace(/_/g, ' ') : ''
    const time = parseInt(timestamp)
    return {value, name, timestamp: isNaN(time) ? null : time}
}

/** value of the version that is live for the type */
export const getLiveVersion = (selectedVersions, type) =>
    (selectedVersions && selectedVersions[type]) || DEFAULT_VERSION

export const isLiveVersion = (selectedVersions, type, value) =>
    getLiveVersion(selectedVersions, type) === (value || DEFAULT_VERSION)
