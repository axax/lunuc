/**
 * Version helpers, used by the api and the client (/admin/system -> Update).
 */

/** compares "v26.1.0" / "8.0.15" / "8.0" numerically, < 0 if a is older than b */
export const compareVersions = (a, b) => {
    const pa = String(a).replace(/^v/, '').split(/[.-]/), pb = String(b).replace(/^v/, '').split(/[.-]/)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (parseInt(pa[i]) || 0) - (parseInt(pb[i]) || 0)
        if (diff) return diff
    }
    return 0
}

/** true if a is newer than b (both set) */
export const isNewerVersion = (a, b) => !!a && !!b && compareVersions(a, b) > 0

/** "v26.13.0" -> 26 */
export const majorOf = version => parseInt(String(version).replace(/^v/, ''))

/** release series: "8.0.15" -> "8.0" */
export const seriesOf = version => version ? String(version).replace(/^v/, '').split('.').slice(0, 2).join('.') : null
