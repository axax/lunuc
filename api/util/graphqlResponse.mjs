// JSON.stringify replacer: leaves out null / undefined values in objects and arrays (smaller
// cmsPage responses). Same result as the former removeNullsMutating, but while serializing:
// no second walk over the data, no delete (slows down objects in V8) and the data - which can
// come from a cache - is not changed.
export const withoutNulls = (key, value) => {
    if (value === null) {
        return undefined
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            if (value[i] == null) {
                return value.filter(entry => entry != null)
            }
        }
    }
    return value
}
const DATA_PLACEHOLDER = '\u0000graphqlData\u0000'
const DATA_PLACEHOLDER_JSON = JSON.stringify(DATA_PLACEHOLDER)

// response body as JSON - for cmsPage the nulls inside data are left out
export const graphqlResponseJson = (body) => {
    if (!body?.data?.cmsPage) {
        return JSON.stringify(body)
    }
    // only data without nulls (not errors etc.), in the same position as before
    const dataJson = JSON.stringify(body.data, withoutNulls)
    return JSON.stringify({...body, data: DATA_PLACEHOLDER}).replace(DATA_PLACEHOLDER_JSON, () => dataJson)
}
