import fs from 'fs'
import path from 'path'

// private can come as boolean or (multipart upload) as string
export const isMediaPrivate = (value) => value === true || value === 'true'

// The file of a media in the upload dir: "<id>", or "private<id>" for a private media (only served
// after an access check). media = the Media entry (or only its id). The name matching the private flag
// is tried first, then the other one (a file that is not renamed yet). null if there is no file.
export const mediaFilePath = async (uploadDir, media) => {
    const id = String(media && media._id ? media._id : media)
    const names = isMediaPrivate(media && media.private) ? ['private' + id, id] : [id, 'private' + id]
    for (const name of names) {
        const filePath = path.join(uploadDir, name)
        try {
            await fs.promises.access(filePath)
            return filePath
        } catch (e) {
        }
    }
    return null
}
