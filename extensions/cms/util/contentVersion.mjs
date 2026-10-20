/*
 * Short fingerprint of a field value (template, style, ...), used client and server side to detect that
 * someone else saved the same field while it was edited (see updateCmsPage, baseVersions).
 * FNV-1a over the UTF-16 code units plus the length - fast, not cryptographic, only compared for equality.
 */
export const contentVersion = (value) => {
    if (value === undefined || value === null) {
        return ''
    }
    const str = String(value)
    let hash = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return str.length.toString(36) + '.' + hash.toString(36)
}

// fields that are checked for concurrent changes
export const VERSIONED_FIELDS = ['template', 'style', 'script', 'serverScript', 'dataResolver']
