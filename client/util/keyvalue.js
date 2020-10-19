import {NO_SESSION_KEY_VALUES, NO_SESSION_KEY_VALUES_SERVER} from 'client/constants'
import {client, NetworkStatus, RequestType, useQuery} from '../middleware/graphql'


export const QUERY_KEY_VALUES = 'query keyValues($keys:[String]){keyValues(keys:$keys){limit offset total results{key value status createdBy{_id username}}}}'
export const QUERY_SET_KEY_VALUE_GLOBAL = 'mutation setKeyValueGlobal($key:String!,$value:String!){setKeyValueGlobal(key:$key,value:$value){key value status}}'

export const useKeyValues = (keys) => {

   // const [response, setResponse] = useState({data: null, networkStatus: 0, loading: true})

    const {data,loading} = useQuery(QUERY_KEY_VALUES, {variables:{keys}})
    const enhancedData={}
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
    return {loading,data: enhancedData}

}

export const setKeyValueGlobal = (key, value) =>{
    return client.mutate({
        mutation: QUERY_SET_KEY_VALUE_GLOBAL,
        variables: {key, value: value.constructor === Object ? JSON.stringify(value) : value},
        update: (store, {data: {setKeyValue}}) => {
        }
    })
}

const keyValuesFromLS = {}


export const getKeyValueFromLS = (key) => {
    const kv = getKeyValuesFromLS()
    try {
        return JSON.parse(kv[key])
    } catch (e) {
        return kv[key]
    }
}

export const getKeyValuesFromLS = () => {
    const kvServer = getKeyValuesFromLSByKey(NO_SESSION_KEY_VALUES_SERVER),
        kvClient = getKeyValuesFromLSByKey(NO_SESSION_KEY_VALUES)
    return Object.assign({}, kvClient, kvServer)
}

export const getKeyValuesFromLSByKey = (localStorageKey) => {

    if (!keyValuesFromLS[localStorageKey]) {
        try {
            keyValuesFromLS[localStorageKey] = JSON.parse(localStorage.getItem(localStorageKey))
        } finally {
        }
        if (!keyValuesFromLS[localStorageKey]) keyValuesFromLS[localStorageKey] = {}
    }
    return keyValuesFromLS[localStorageKey]
}

export const setKeyValueToLS = (key, value, server) => {
    const localStorageKey = server ? NO_SESSION_KEY_VALUES_SERVER : NO_SESSION_KEY_VALUES

    const kv = getKeyValuesFromLSByKey(localStorageKey)
    kv[key] = value

    localStorage.setItem(localStorageKey, JSON.stringify(kv))
}
