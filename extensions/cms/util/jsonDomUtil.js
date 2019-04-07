/**
 * Object with helper methods for jsonDom handling
 */

export const getComponentByKey = (key, json) => {
    if (!json) return
    const keyParts = key.split('.')

    // the root is always 0 so remove it
    keyParts.shift()

    if (json.constructor !== Array) {
        keyParts.shift()
    }
    let cur = json
    for (let i = 0; i < keyParts.length; i++) {
        if (i > 0 && keyParts[i - 1] === '$loop') {
            continue
        }
        const part = keyParts[i]
        if (cur.constructor === Object && cur.c) cur = cur.c
        if (cur.constructor === Object && !isNaN(part)) cur = [cur]

        if (!cur[part]) {
            console.warn('Something is wrong with the key: ' + key, part)
            return null
        }
        cur = cur[part]
    }
    return cur
}


export const addComponent = ({key, json, index, component}) => {
    const subJson = getComponentByKey(key, json)

    if (subJson) {

        let c = subJson['c']
        if (!c) {
            c = []
        } else if (c.constructor === Object) {
            c = [c]
        } else if (c.constructor === String) {
            c = [{c}]
        }
        if (!component) {
            component = {'c': 'new component'}
        }
        if (!index) {
            index = c.length
        }

        c.splice(index, 0, component)
        subJson.c = c
    }
    return subJson
}
