/**
 * Object with helper methods for jsonDom handling (included in main.bundle)
 */

export const getComponentByKey = (key, json) => {
    if (!json || !key) return
    const posDash = key.lastIndexOf('-')
    let editedKey
    if (posDash >= 0) {
        // key has a dash if it is a nested CMS Page
        editedKey = key.substring(posDash + 1)
    } else {
        editedKey = key
    }
    const keyParts = editedKey.split('.')

    // as the key always starts with 0 remove the first value
    keyParts.shift()

    if (json.constructor !== Array) {
        keyParts.shift()
    }
    let cur = json
    for (let i = 0; i < keyParts.length; i++) {
        if (i > 0 && keyParts[i - 1] === '$loop') {
            continue
        }
        let part = keyParts[i]
        if (cur.constructor === Object && cur.c) cur = cur.c
        if (cur.constructor === Object && !isNaN(part)) cur = [cur]

        if (!cur[part] && part === '$loop') {
            // $loop and $for are the same
            part = '$for'
        }
        if (!cur[part]) {
            console.warn('Something is wrong with the key: ' + editedKey, part)
            return null
        }
        cur = cur[part]
    }
    return cur
}