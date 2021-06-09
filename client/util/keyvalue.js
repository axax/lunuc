import {NO_SESSION_KEY_VALUES} from 'client/constants'
import {client, useQuery} from '../middleware/graphql'

export const QUERY_KEY_VALUES = 'query keyValues($keys:[String]){keyValues(keys:$keys){limit offset total results{key value status createdBy{_id username}}}}'
export const QUERY_SET_KEY_VALUE = 'mutation setKeyValue($key:String!,$value:String!){setKeyValue(key:$key,value:$value){key value status createdBy{_id username}}}'
export const QUERY_KEY_VALUES_GLOBAL = 'query keyValueGlobals($keys:[String]){keyValueGlobals(keys:$keys){limit offset total results{key value status}}}'
export const QUERY_SET_KEY_VALUE_GLOBAL = 'mutation setKeyValueGlobal($key:String!,$value:String!){setKeyValueGlobal(key:$key,value:$value){key value status}}'

export const useKeyValues = (keys) => {
    const {data, loading} = useQuery(QUERY_KEY_VALUES, {variables: {keys}})
    const enhancedData = {}
    if (data && data.keyValues.results) {
        for (const i in data.keyValues.results) {
            const o = data.keyValues.results[i]
            try {
                enhancedData[o.key] = JSON.parse(o.value)
            } catch (e) {
                enhancedData[o.key] = o.value
            }
        }
    }
    return {loading, data: enhancedData}
}

export const getKeyValueFromLS = (key) => {
    const kv = getKeyValuesFromLS()
    try {
        return JSON.parse(kv[key])
    } catch (e) {
        return kv[key]
    }
}

export const getKeyValuesFromLS = () => {
    const kvServer = getValuesFromLocalStorageAsJson(NO_SESSION_KEY_VALUES + '_SERVER'),
        kvClient = getValuesFromLocalStorageAsJson(NO_SESSION_KEY_VALUES)
    return Object.assign({}, kvClient, kvServer)
}

export const setKeyValueToLS = ({key, value, server}) => {
    if (!_app_.noStorage) {
        const localStorageKey = NO_SESSION_KEY_VALUES + (server ? '_SERVER' : '')

        const kv = getValuesFromLocalStorageAsJson(localStorageKey)
        kv[key] = value

        localStorage.setItem(localStorageKey, JSON.stringify(kv))
    }
}

const getValuesFromLocalStorageAsJson = (localStorageKey) => {
    let json = {}
    if (!_app_.noStorage) {
        const kv = localStorage.getItem(localStorageKey)
        if (kv) {
            try {
                json = JSON.parse(kv)
            } catch (e) {
                json = {}
            }
        }
    }

    return json
}
