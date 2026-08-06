/* A function for deep (recursive) merging of objects and arrays */
const isObject = obj => obj && obj.constructor === Object

/* Builds a merge function with the options baked in, so the recursion neither
   passes nor re-destructures them on every single node. */
const createMerger = ({mergeArray, concatArrays, arrayCutToLast, arrayIdProperty}) => {

    /* Matches entries on `arrayIdProperty` instead of by index. Returns null when
       nothing in `a` is resolved, so the caller can fall back to index/concat. */
    const mergeById = (a, b) => {
        const byId = new Map()
        for (let i = 0; i < a.length; i++) {
            const id = isObject(a[i]) ? a[i][arrayIdProperty] : undefined
            if (id !== undefined) {
                byId.set(String(id), a[i])
            }
        }
        if (!byId.size) return null

        return b.map(item => {
            if (isObject(item)) {
                const prev = byId.get(String(item[arrayIdProperty]))
                return prev ? merge(prev, item) : item
            }
            // a bare id is an unresolved reference -> keep what we already resolved
            return byId.get(String(item)) || {[arrayIdProperty]: item}
        })
    }

    const merge = (a, b) => {
        if (a === b) return b

        if (Array.isArray(a) && Array.isArray(b)) {
            if (arrayIdProperty) {
                const byId = mergeById(a, b)
                if (byId) return byId
            }
            if (mergeArray) {
                const out = arrayCutToLast ? a.slice(0, b.length) : a.slice()
                for (let i = 0; i < b.length; i++) {
                    out[i] = merge(out[i], b[i])
                }
                return out
            }
            return concatArrays ? a.concat(...b) : b
        }

        if (isObject(a) && isObject(b)) {
            const out = {...a}
            for (const key in b) {
                out[key] = merge(out[key], b[key])
            }
            return out
        }

        return b
    }

    return merge
}

const _mergeAll = (merge, objects) => objects.reduce(
    (prev, obj) => obj ? merge(prev, obj) : prev,
    Array.isArray(objects[0]) ? [] : {}
)

const _modify = (obj, newObj) => {
    Object.keys(obj).forEach(key => {
        if (!Object.hasOwn(newObj, key)) delete obj[key]
    })
    Object.assign(obj, newObj)
}

const defaultMerge = createMerger({})

export function deepMerge(...objects) {
    return _mergeAll(defaultMerge, objects)
}

export function deepMergeToFirst(o, ...objects) {
    _modify(o, _mergeAll(defaultMerge, [o, ...objects]))
}

export function deepMergeOptional(options, ...objects) {
    return _mergeAll(createMerger(options), objects)
}