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
