// template-ops.mjs
// Pure, DOM free application of lunuc_component template operations.

export class TemplateOpError extends Error {
    constructor(message) {
        super(message)
        this.name = 'TemplateOpError'
    }
}

const OPERATIONS = ['update', 'add', 'remove']

/** Normalizes the `op` / `operation` aliases into a single value. */
export function normalizeOperation(message) {
    return message.operation || message.op || null
}

function splitPath(rawPath) {
    let path = rawPath
    if (path.startsWith('template.')) {
        path = path.substring(9)
    }
    return path.split('.').filter((s) => s !== '')
}

function readSegment(node, segment) {
    if (node == null) {
        return undefined
    }
    if (Array.isArray(node) && /^\d+$/.test(segment)) {
        return node[Number(segment)]
    }
    return node[segment]
}

function walk(root, segments) {
    let node = root
    for (const segment of segments) {
        node = readSegment(node, segment)
        if (node === undefined) {
            return undefined
        }
    }
    return node
}

/** Parses the stored template into an array, whatever shape it is stored in. */
export function parseTemplate(raw) {
    let template = raw
    if (typeof template === 'string') {
        try {
            template = JSON.parse(template)
        } catch (e) {
            throw new TemplateOpError('Current template is not valid JSON: ' + e.message)
        }
    }
    if (template == null) {
        throw new TemplateOpError('Current template is empty')
    }
    return Array.isArray(template) ? template : [template]
}

/**
 * Applies one operation to a parsed template tree.
 * The tree is mutated in place and also returned.
 *
 * Addressing works purely through the path: the last segment is the accessor
 * into its parent. There is no identity search, so primitive children and
 * duplicated values are addressed correctly.
 */
export function applyTemplateOperation(template, {path, operation, data, location}) {
    if (OPERATIONS.indexOf(operation) < 0) {
        throw new TemplateOpError(`Unknown operation "${operation}"`)
    }

    const segments = splitPath(path)
    if (!segments.length) {
        throw new TemplateOpError('Empty path — use a full replacement instead')
    }

    const accessor = segments[segments.length - 1]
    const parentSegments = segments.slice(0, -1)
    const parent = parentSegments.length ? walk(template, parentSegments) : template

    if (parent == null || typeof parent !== 'object') {
        throw new TemplateOpError(`Parent path "${parentSegments.join('.')}" not found in template`)
    }

    const isIndexed = Array.isArray(parent) && /^\d+$/.test(accessor)
    const index = isIndexed ? Number(accessor) : -1

    // The block parser may wrap a single node in an array - unwrap it.
    let newNode = data
    if (Array.isArray(newNode) && newNode.length === 1) {
        newNode = newNode[0]
    }

    if (operation === 'remove') {
        if (isIndexed) {
            if (index >= parent.length) {
                throw new TemplateOpError(`Index ${index} out of range at "${path}"`)
            }
            parent.splice(index, 1)
        } else {
            if (!(accessor in parent)) {
                throw new TemplateOpError(`Path "${path}" not found in template`)
            }
            delete parent[accessor]
        }
        return template
    }

    if (newNode === undefined) {
        throw new TemplateOpError(`Missing data for operation "${operation}"`)
    }

    if (operation === 'update') {
        if (isIndexed) {
            if (index >= parent.length) {
                throw new TemplateOpError(`Index ${index} out of range at "${path}"`)
            }
            parent[index] = newNode
        } else {
            parent[accessor] = newNode
        }
        return template
    }

    // add - insert as a sibling next to the addressed node
    if (!isIndexed) {
        throw new TemplateOpError(
            `Operation "add" needs a path ending in an array index, got "${path}"`
        )
    }
    const at = location === 'before' ? index : index + 1
    parent.splice(Math.max(0, Math.min(at, parent.length)), 0, newNode)
    return template
}