import {client} from '../../../client/middleware/graphql'
import {downloadAs} from '../../../client/util/download'
import {_t} from '../../../util/i18n.mjs'

/**
 * client side helpers for the export / import of CmsPages as files (zip).
 * The conversion itself happens on the server (see cmsPageFilesServer.mjs).
 */

const base64ToBytes = (base64) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

const bytesToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    // chunks, String.fromCharCode with a huge argument list overflows the stack
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
}

const firstError = (response) => response && response.errors && response.errors.length > 0 ?
    new Error(response.errors.map(e => e.message).join(', ')) : null

/**
 * downloads the pages as zip (one folder per page)
 * @returns Promise with the number of exported pages
 */
export const exportCmsPagesAsZip = ({ids, slugs, _version}) => {
    return client.query({
        fetchPolicy: 'network-only',
        query: 'query exportCmsPages($ids:[ID],$slugs:[String],$_version:String){exportCmsPages(ids:$ids,slugs:$slugs,_version:$_version){name count data}}',
        variables: {ids, slugs, _version}
    }).then(response => {
        const error = firstError(response)
        if (error) {
            throw error
        }
        const result = response.data && response.data.exportCmsPages
        if (!result || !result.data) {
            throw new Error(_t('CmsPageFiles.exportFailed'))
        }
        downloadAs(base64ToBytes(result.data), result.name)
        return result.count
    })
}

/**
 * opens a file picker for a zip file
 * @returns Promise with the File or null if nothing was selected
 */
export const pickZipFile = () => new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip,application/x-zip-compressed'
    input.style.display = 'none'
    input.addEventListener('change', () => {
        resolve(input.files && input.files[0] ? input.files[0] : null)
        input.remove()
    })
    // cancel event is not supported everywhere, the promise just stays pending then
    input.addEventListener('cancel', () => {
        resolve(null)
        input.remove()
    })
    document.body.appendChild(input)
    input.click()
})

/**
 * uploads a zip created by the export (or edited afterwards) and imports it
 * @returns Promise with {created, updated, unchanged, skipped, slugs, errors}
 */
export const importCmsPagesFromZip = (file, {_version, createMissing = true, dryRun = false} = {}) => {
    return file.arrayBuffer().then(buffer => client.mutate({
        mutation: 'mutation importCmsPages($data:String!,$_version:String,$createMissing:Boolean,$dryRun:Boolean){importCmsPages(data:$data,_version:$_version,createMissing:$createMissing,dryRun:$dryRun){created updated unchanged skipped slugs errors}}',
        variables: {data: bytesToBase64(buffer), _version, createMissing, dryRun}
    })).then(response => {
        const error = firstError(response)
        if (error) {
            throw error
        }
        return response.data.importCmsPages
    })
}

/**
 * short text summary of an import result
 */
export const formatImportResult = (result) => {
    const lines = [_t('CmsPageFiles.importSummary', {
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        skipped: result.skipped
    })]
    if (result.slugs && result.slugs.length) {
        lines.push('', ...result.slugs.map(s => '• ' + s))
    }
    if (result.errors && result.errors.length) {
        lines.push('', _t('CmsPageFiles.errors'), ...result.errors.map(e => '• ' + e))
    }
    return lines.join('\n')
}
