import fs from 'fs'
import path from 'path'

export const ensureDirectoryExistence = (dir) => {
    if (fs.existsSync(dir)) {
        return true
    }
    ensureDirectoryExistence(path.dirname(dir))
    fs.mkdirSync(dir)
    return fs.existsSync(dir)
}

export const isFileNotNewer = (filename, statsMainFile) => {
    let isFile = fs.existsSync(filename)

    if (isFile) {
        const statsFile = fs.statSync(filename)

        // compare date
        if (statsMainFile.mtime > statsFile.mtime) {
            isFile = false
        }
    }
    return isFile
}