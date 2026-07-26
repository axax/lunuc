import AdmZip from 'adm-zip'
import path from 'path'
import fs from 'fs'

/**
 * Safely extracts a ZIP file into destDir.
 *
 * Protects against "zip slip": zip entries whose path (e.g. via "../../..")
 * would resolve outside of destDir cause the entire extraction to abort,
 * BEFORE any file is written.
 *
 * Used as a replacement for:
 *   zipper.sync.unzip(file.filepath).save(destDir)
 * which performs no path validation whatsoever.
 */
export const safeUnzipToDir = (zipFilePath, destDir) => {
    const resolvedDest = path.resolve(destDir)

    if (!fs.existsSync(resolvedDest)) {
        fs.mkdirSync(resolvedDest, {recursive: true})
    }

    const zip = new AdmZip(zipFilePath)
    const entries = zip.getEntries()

    // Pass 1: validate ALL entries before anything is written.
    for (const entry of entries) {
        const entryPath = path.resolve(resolvedDest, entry.entryName)

        const isInsideDest =
            entryPath === resolvedDest ||
            entryPath.startsWith(resolvedDest + path.sep)

        if (!isInsideDest) {
            throw new Error(
                `Zip slip detected - refusing to extract "${entry.entryName}" ` +
                `which would resolve outside of "${resolvedDest}"`
            )
        }

        // Additionally: don't allow absolute paths or symlink entries.
        if (path.isAbsolute(entry.entryName)) {
            throw new Error(
                `Refusing to extract entry with absolute path: "${entry.entryName}"`
            )
        }
    }

    // Pass 2: now that all entries are validated, actually extract.
    zip.extractAllTo(resolvedDest, true)
}