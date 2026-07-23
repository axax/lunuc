// util/fileUtil.mjs
//
// ensureDirectoryExistence: create a directory including all parents,
// return whether it exists afterwards.
//
// Fixes over the original version:
//   - race-free: two concurrent callers creating the same directory no
//     longer throw EEXIST into the request handler. mkdirSync with
//     {recursive: true} is idempotent by contract.
//   - no hand-rolled recursion (native since Node 10.12).
//   - failures (EACCES, ENOSPC, path is a file, ...) return false instead
//     of throwing - callers already treat the return value as the verdict.
//
// Memoization is OPT-IN via the second parameter: pass true on hot paths
// where the directory is known to be long-lived (e.g. the ssr cache dirs,
// checked on every bot request) - the call then degrades to a Set lookup
// without any syscall. Callers that do not opt in always get a real
// mkdirSync, so externally deleted directories are transparently
// recreated - matching the original behaviour.
//
// NOTE for cacheable=true: the memoization assumes the directory is not
// deleted at runtime by external actors (make sure e.g. cleanup cronjobs
// delete files only, never directories). invalidateEnsuredDir exists for
// the rare case code deletes a cached dir itself.

import fs from 'fs'

const ensuredDirs = new Set()
const ENSURED_MAX_ENTRIES = 10000

export const ensureDirectoryExistence = (dir, cacheable = false) => {
    if (cacheable && ensuredDirs.has(dir)) {
        return true
    }
    try {
        // idempotent: creates all missing parents, does NOT throw if the
        // directory already exists (only if the path exists as a non-dir)
        fs.mkdirSync(dir, {recursive: true})
    } catch (e) {
        console.warn(`ensureDirectoryExistence failed for ${dir}: ${e.message}`)
        return false
    }

    if (cacheable) {
        // primitive size cap, same pattern as the other caches - dir sets
        // are naturally small, this is just a safety net
        if (ensuredDirs.size >= ENSURED_MAX_ENTRIES) {
            ensuredDirs.delete(ensuredDirs.values().next().value)
        }
        ensuredDirs.add(dir)
    }
    return true
}

export const invalidateEnsuredDir = (dir) => {
    ensuredDirs.delete(dir)
}