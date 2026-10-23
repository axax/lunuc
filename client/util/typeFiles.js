import {client} from '../middleware/graphql'
import {downloadAs} from './download'
import {_t} from '../../util/i18n.mjs'

/**
 * client side of the export / import of type entries as files (zip), see api/util/typeFiles.mjs.
 * Which types are supported is asked from the server once (types register a handler there).
 */

let typesPromise = null

export const loadTypeFilesTypes = () => {
    if (!typesPromise) {
        typesPromise = client.query({
            fetchPolicy: 'cache-first',
            query: 'query typeFilesTypes{typeFilesTypes}'
        }).then(response => (response.data && response.data.typeFilesTypes) || [])
            .catch(() => {
                typesPromise = null
                return []
            })
    }
    return typesPromise
}

export const base64ToBytes = (base64) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

export const bytesToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    // chunks, String.fromCharCode with a huge argument list overflows the stack
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    }
    return btoa(binary)
}

export const firstError = (response) => response && response.errors && response.errors.length > 0 ?
    new Error(response.errors.map(e => e.message).join(', ')) : null

/**
 * downloads the entries as zip, returns the number of exported entries
 */
export const exportTypeFilesAsZip = ({type, ids}) => client.query({
    fetchPolicy: 'network-only',
    query: 'query exportTypeFiles($type:String!,$ids:[ID]!){exportTypeFiles(type:$type,ids:$ids){name count data}}',
    variables: {type, ids}
}).then(response => {
    const error = firstError(response)
    if (error) throw error
    const result = response.data && response.data.exportTypeFiles
    if (!result || !result.data) throw new Error(_t('TypeFiles.exportFailed'))
    downloadAs(base64ToBytes(result.data), result.name)
    return result.count
})

/**
 * export / import of everything the user has access to (/admin/system), needs capability export_import_data
 */
export const loadExportAllSources = () => client.query({
    fetchPolicy: 'network-only',
    query: 'query exportAllTypeFilesSources{exportAllTypeFilesSources{type folder}}'
}).then(response => {
    const error = firstError(response)
    if (error) throw error
    return (response.data && response.data.exportAllTypeFilesSources) || []
})

export const exportAllTypeFilesAsZip = ({aiGuide = false} = {}) => client.query({
    fetchPolicy: 'network-only',
    query: 'query exportAllTypeFiles($aiGuide:Boolean){exportAllTypeFiles(aiGuide:$aiGuide){name count data}}',
    variables: {aiGuide}
}).then(response => {
    const error = firstError(response)
    if (error) throw error
    const result = response.data && response.data.exportAllTypeFiles
    if (!result || !result.data) throw new Error(_t('TypeFiles.exportFailed'))
    downloadAs(base64ToBytes(result.data), result.name)
    return result.count
})

export const importAllTypeFilesFromZip = (file, {dryRun = false, createMissing = true} = {}) => file.arrayBuffer()
    .then(buffer => client.mutate({
        mutation: 'mutation importAllTypeFiles($data:String!,$dryRun:Boolean,$createMissing:Boolean){importAllTypeFiles(data:$data,dryRun:$dryRun,createMissing:$createMissing){created updated unchanged skipped names errors}}',
        variables: {data: bytesToBase64(buffer), dryRun, createMissing}
    })).then(response => {
        const error = firstError(response)
        if (error) throw error
        return response.data.importAllTypeFiles
    })

/**
 * whether exports include the guide for AI assistants (AGENTS.md, CLAUDE.md, _lunuc/ reference).
 * One setting for all exports (pages and "export all"), remembered per browser, default on.
 */
const AI_GUIDE_KEY = 'exportAiGuide'
export const getExportAiGuide = () => {
    try {
        return window.localStorage.getItem(AI_GUIDE_KEY) !== '0'
    } catch (e) {
        return true
    }
}
export const setExportAiGuide = (value) => {
    try {
        window.localStorage.setItem(AI_GUIDE_KEY, value ? '1' : '0')
    } catch (e) {
    }
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

export const importTypeFilesFromZip = (file, {type, dryRun = false, createMissing = true}) => file.arrayBuffer()
    .then(buffer => client.mutate({
        mutation: 'mutation importTypeFiles($type:String!,$data:String!,$dryRun:Boolean,$createMissing:Boolean){importTypeFiles(type:$type,data:$data,dryRun:$dryRun,createMissing:$createMissing){created updated unchanged skipped names errors}}',
        variables: {type, data: bytesToBase64(buffer), dryRun, createMissing}
    })).then(response => {
        const error = firstError(response)
        if (error) throw error
        return response.data.importTypeFiles
    })

/**
 * short text summary of an import result ({created, updated, ..., names or slugs, errors}).
 * trPrefix: translation keys <prefix>.importSummary / <prefix>.errors (e.g. CmsPageFiles in the page editor)
 */
export const formatTypeFilesResult = (result, {trPrefix = 'TypeFiles'} = {}) => {
    const lines = [_t(trPrefix + '.importSummary', {
        created: result.created, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped
    })]
    const names = result.names || result.slugs
    if (names && names.length) {
        lines.push('', ...names.map(s => '• ' + s))
    }
    if (result.errors && result.errors.length) {
        lines.push('', _t(trPrefix + '.errors'), ...result.errors.map(e => '• ' + e))
    }
    return lines.join('\n')
}
