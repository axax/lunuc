import {NO_SESSION_KEY_VALUES} from 'client/constants/index.mjs'
import {client, useQuery} from '../middleware/graphql'

export const QUERY_KEY_VALUES = 'query keyValues($keys:[String],$global:Boolean){keyValues(keys:$keys,global:$global){limit offset total results{key value status createdBy{_id username}}}}'
export const QUERY_SET_KEY_VALUE = 'mutation setKeyValue($key:String!,$value:String){setKeyValue(key:$key,value:$value){key value status createdBy{_id username}}}'
export const QUERY_KEY_VALUES_GLOBAL = 'query keyValueGlobals($keys:[String]){keyValueGlobals(keys:$keys){limit offset total results{key value status}}}'
export const QUERY_SET_KEY_VALUE_GLOBAL = 'mutation setKeyValueGlobal($key:String!,$value:String){setKeyValueGlobal(key:$key,value:$value){key value status}}'

export const useKeyValues = (keys, options, keyName = 'keyValues') => {
    const {data, loading} = useQuery(keyName === 'keyValues' ? QUERY_KEY_VALUES : QUERY_KEY_VALUES_GLOBAL, {variables: {keys,...options}})
    const enhancedData = {}
    if (data) {
        const keyData = data[keyName]
        if (keyData && keyData.results) {
            for (const i in keyData.results) {
                const o = keyData.results[i]
                try {
                    enhancedData[o.key] = JSON.parse(o.value)
                } catch (e) {
                    enhancedData[o.key] = o.value
                }
            }
        }
    }
    return {loading, data: enhancedData}
}

export const useKeyValuesGlobal = (keys, options) => {
    return useKeyValues(keys,options, 'keyValueGlobals')
}

export const setKeyValue = ({key, value, clearCache, global}) => {

    const variables = {
        key,
        value: value && value.constructor !== String ? JSON.stringify(value) : value
    }

    const query = global?QUERY_KEY_VALUES_GLOBAL:QUERY_KEY_VALUES
    const keyName = global?'keyValueGlobals':'keyValues'

    if(clearCache){
        client.clearCacheStartsWith(query)
    }else {
        // if there is a exact match update the value
        const existingData = client.readQuery({query, variables: {keys: [key]}})
        if (existingData && existingData[keyName] && existingData[keyName].results) {
            let results = existingData[keyName].results
            const resultItem = results.find(item=>item.key==key)
            if(resultItem){
                resultItem.value = variables.value
            }else{
                results.push({key,value:variables.value})
            }
            existingData[keyName].results = results
            client.writeQuery({query, variables: {keys: [key]}, data: existingData})

        }
    }

    return client.mutate({
        mutation: global?QUERY_SET_KEY_VALUE_GLOBAL:QUERY_SET_KEY_VALUE,
        variables
    })
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
