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

export const pickZipFile = () => new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip,application/x-zip-compressed'
    input.style.display = 'none'
    input.addEventListener('change', () => {
        resolve(input.files && input.files[0] ? input.files[0] : null)
        input.remove()
    })
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

export const formatTypeFilesResult = (result) => {
    const lines = [_t('TypeFiles.importSummary', {
        created: result.created, updated: result.updated, unchanged: result.unchanged, skipped: result.skipped
    })]
    if (result.names && result.names.length) {
        lines.push('', ...result.names.map(s => '• ' + s))
    }
    if (result.errors && result.errors.length) {
        lines.push('', _t('TypeFiles.errors'), ...result.errors.map(e => '• ' + e))
    }
    return lines.join('\n')
}
