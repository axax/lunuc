import {useEffect} from 'react'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {
    $createParagraphNode,
    $getNodeByKey,
    $insertNodes,
    $isRootOrShadowRoot,
    COMMAND_PRIORITY_EDITOR,
    COMMAND_PRIORITY_LOW,
    createCommand
} from 'lexical'
import {$wrapNodeInElement, mergeRegister} from '@lexical/utils'
import {DRAG_DROP_PASTE} from '@lexical/rich-text'
import UploadUtil from 'client/util/upload'
import config from 'gen/config-client'
import {$createImageNode, $isImageNode, ImageNode} from '../nodes/ImageNode.js'

const {UPLOAD_URL, PRETTYURL_SEPERATOR} = config

export const INSERT_IMAGE_COMMAND = createCommand('INSERT_IMAGE_COMMAND')
export const UPLOAD_IMAGE_COMMAND = createCommand('UPLOAD_IMAGE_COMMAND')

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
// Diese Formate werden nicht clientseitig verkleinert (Animation / Vektor)
const NO_RESIZE_TYPES = ['image/gif', 'image/svg+xml']
const MAX_IMAGE_SIZE = 2400

export const isImageFile = (file) => file && IMAGE_MIME_TYPES.indexOf(file.type) >= 0

export const mediaUrl = ({_id, name}) => `${UPLOAD_URL}/${_id}/${PRETTYURL_SEPERATOR}/${encodeURIComponent(name || 'image')}`

/**
 * Lädt eine Bilddatei in die Media-Verwaltung hoch.
 * Grosse Bilder werden vorher clientseitig auf MAX_IMAGE_SIZE verkleinert.
 */
export const uploadImage = (file, {group} = {}) => new Promise((resolve, reject) => {
    const doUpload = (dataUrl) => {
        UploadUtil.uploadData({
            dataUrl,
            blob: dataUrl ? undefined : file,
            fileName: file.name,
            uploadTo: '/graphql/upload',
            data: group ? {group} : undefined,
            onLoad: (e) => {
                const response = e.target.response
                if (response && response.status === 'success' && response.files && response.files.length) {
                    resolve(response.files[0])
                } else {
                    reject(new Error((response && response.message) || e.target.statusText || 'Upload failed'))
                }
            },
            onError: (e) => reject(e instanceof Error ? e : new Error('Upload failed'))
        })
    }

    if (NO_RESIZE_TYPES.indexOf(file.type) >= 0) {
        doUpload(null)
    } else {
        UploadUtil.resizeImageFromFile({
            file,
            conversion: [{maxWidth: MAX_IMAGE_SIZE, maxHeight: MAX_IMAGE_SIZE, quality: 0.85}],
            onSuccess: doUpload
        })
    }
})

export default function ImagesPlugin({onError, mediaGroup}) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([ImageNode])) {
            throw new Error('ImagesPlugin: ImageNode not registered on editor')
        }

        const insertImage = (payload) => {
            const imageNode = $createImageNode(payload)
            $insertNodes([imageNode])
            if ($isRootOrShadowRoot(imageNode.getParentOrThrow())) {
                // sicherstellen, dass nach dem Bild weitergeschrieben werden kann
                if (!imageNode.getNextSibling()) {
                    imageNode.insertAfter($createParagraphNode())
                }
            } else {
                $wrapNodeInElement(imageNode, $createParagraphNode).selectEnd()
            }
            return imageNode.getKey()
        }

        const uploadFiles = (files) => {
            const images = Array.from(files || []).filter(isImageFile)
            if (images.length === 0) {
                return false
            }
            images.forEach(file => {
                const localUrl = URL.createObjectURL(file)
                let nodeKey
                editor.update(() => {
                    nodeKey = insertImage({src: localUrl, altText: file.name.replace(/\.[^.]+$/, ''), uploading: true})
                })

                uploadImage(file, {group: mediaGroup}).then(media => {
                    editor.update(() => {
                        const node = $getNodeByKey(nodeKey)
                        if ($isImageNode(node)) {
                            node.setSrc(mediaUrl(media))
                            node.setMediaId(media._id)
                            node.setUploading(false)
                        }
                    })
                }).catch(error => {
                    editor.update(() => {
                        const node = $getNodeByKey(nodeKey)
                        if (node) {
                            node.remove()
                        }
                    })
                    if (onError) {
                        onError(error)
                    } else {
                        console.error(error)
                    }
                }).finally(() => {
                    setTimeout(() => URL.revokeObjectURL(localUrl), 5000)
                })
            })
            return true
        }

        return mergeRegister(
            editor.registerCommand(INSERT_IMAGE_COMMAND, (payload) => {
                insertImage(payload)
                return true
            }, COMMAND_PRIORITY_EDITOR),
            editor.registerCommand(UPLOAD_IMAGE_COMMAND, (files) => uploadFiles(files), COMMAND_PRIORITY_EDITOR),
            // Drag & Drop sowie Einfügen aus der Zwischenablage
            editor.registerCommand(DRAG_DROP_PASTE, (files) => uploadFiles(files), COMMAND_PRIORITY_LOW)
        )
    }, [editor, onError, mediaGroup])

    return null
}
