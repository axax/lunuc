/*
 * Data shared to the installed app via the share menu of the system (Web Share Target, Android).
 * serviceworker.js keeps it in the cache "share-target" and opens the page with #share.
 */
const CACHE = 'share-target', BASE = '/share-target'

export const SHARE_HASH = '#share'

export const hasSharedData = () => typeof location !== 'undefined' && location.hash === SHARE_HASH

// {text, files: [File]} or null
export const readSharedData = async () => {
    if (typeof caches === 'undefined') return null
    const cache = await caches.open(CACHE)
    const metaRes = await cache.match(BASE + '/meta')
    if (!metaRes) return null
    const meta = await metaRes.json()
    const files = (await Promise.all((meta.files || []).map(async f => {
        const res = await cache.match(f.key)
        if (!res) return null
        const blob = await res.blob()
        return new File([blob], f.name || 'file', {type: f.type || blob.type})
    }))).filter(Boolean)
    // apps put the link in text or url, the title mostly repeats it
    let text = meta.text || ''
    if (meta.url && text.indexOf(meta.url) < 0) text = text ? text + '\n' + meta.url : meta.url
    if (!text && !files.length) text = meta.title || ''
    return text || files.length ? {text, files} : null
}

export const clearSharedData = () => (typeof caches !== 'undefined' ? caches.delete(CACHE).catch(() => {}) : null)
