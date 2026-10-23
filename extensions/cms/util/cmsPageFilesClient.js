import {client} from '../../../client/middleware/graphql'
import {downloadAs} from '../../../client/util/download'
import {
    base64ToBytes, bytesToBase64, firstError, pickZipFile, getExportAiGuide, setExportAiGuide, formatTypeFilesResult
} from '../../../client/util/typeFiles'
import {_t} from '../../../util/i18n.mjs'

/**
 * client side helpers for the export / import of CmsPages as files (zip).
 * The conversion itself happens on the server (see cmsPageFilesServer.mjs).
 */

/**
 * downloads the pages as zip (one folder per page)
 * @returns Promise with the number of exported pages
 */
export const exportCmsPagesAsZip = ({ids, slugs, _version, aiGuide = getExportAiGuide()}) => {
    return client.query({
        fetchPolicy: 'network-only',
        query: 'query exportCmsPages($ids:[ID],$slugs:[String],$_version:String,$aiGuide:Boolean){exportCmsPages(ids:$ids,slugs:$slugs,_version:$_version,aiGuide:$aiGuide){name count data}}',
        variables: {ids, slugs, _version, aiGuide}
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
 * short text summary of an import result (translations of the cms extension, they are
 * also available in the page editor outside of the admin)
 */
export const formatImportResult = (result) => formatTypeFilesResult(result, {trPrefix: 'CmsPageFiles'})

// shared with the export / import of other types
export {pickZipFile, getExportAiGuide, setExportAiGuide}
