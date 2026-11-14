import path from 'path'
import {ZipArchive} from 'archiver'
import {isHeadRequest} from './file.mjs'

const CHROME_DIR = path.join(path.resolve(), 'extensions/chrome')

// never deliver the signing key, the packed build or local data of the helper (ftp password, local paths)
const IGNORE = ['**/*.pem', '**/*.crx', '**/config.json', '**/ffmpeg-host.sh', '**/.DS_Store']

/** Streams the chrome extension and the ffmpeg helper as zip. The caller checks that the user is an admin. */
export const sendChromeExtensionZip = (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=lunuc-chrome-extension.zip',
        'Cache-Control': 'no-store'
    })

    if (isHeadRequest(req)) {
        // an archive piped into a HEAD response never drains
        res.end()
        return
    }

    const archive = new ZipArchive({zlib: {level: 9}})
    archive.on('error', err => {
        console.error('chrome extension zip', err)
        res.destroy(err)
    })
    archive.pipe(res)
    // file modes are kept (install.sh stays executable)
    archive.glob('{extension,native-host}/**', {cwd: CHROME_DIR, ignore: IGNORE})
    archive.finalize()
}
