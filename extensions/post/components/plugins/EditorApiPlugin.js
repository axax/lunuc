import {useEffect} from 'react'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {$generateHtmlFromNodes, $generateNodesFromDOM} from '@lexical/html'
import {$convertFromMarkdownString, $convertToMarkdownString} from '@lexical/markdown'
import {$getRoot, $insertNodes} from 'lexical'
import {EXTENDED_TRANSFORMERS} from '../utils/markdownTransformers.js'

const countWords = (text) => {
    const trimmed = text.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
}

/**
 * Stellt dem PostContainer eine kleine API zur Verfügung (Export/Import, Fokus)
 * und meldet Wort-/Zeichenstatistiken.
 */
export default function EditorApiPlugin({onReady, onStats, interactionRef}) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!onReady) {
            return
        }
        const api = {
            editor,
            focus: () => editor.focus(),
            exportHtml: () => {
                let html = ''
                editor.getEditorState().read(() => {
                    html = $generateHtmlFromNodes(editor, null)
                })
                return html
            },
            exportMarkdown: () => {
                let md = ''
                editor.getEditorState().read(() => {
                    md = $convertToMarkdownString(EXTENDED_TRANSFORMERS)
                })
                return md
            },
            // ersetzt den gesamten Inhalt (Undo bleibt möglich)
            importMarkdown: (markdown) => {
                if (interactionRef && interactionRef.current) {
                    interactionRef.current()
                }
                editor.update(() => {
                    $convertFromMarkdownString(markdown, EXTENDED_TRANSFORMERS)
                })
            },
            importHtml: (html) => {
                if (interactionRef && interactionRef.current) {
                    interactionRef.current()
                }
                editor.update(() => {
                    const dom = new DOMParser().parseFromString(html, 'text/html')
                    const nodes = $generateNodesFromDOM(editor, dom)
                    $getRoot().clear().select()
                    $insertNodes(nodes)
                })
            }
        }
        onReady(api)
        return () => onReady(null)
    }, [editor, onReady, interactionRef])

    useEffect(() => {
        if (!onStats) {
            return
        }
        let timeout
        const report = (text) => {
            clearTimeout(timeout)
            timeout = setTimeout(() => {
                onStats({words: countWords(text), chars: text.length})
            }, 300)
        }
        editor.getEditorState().read(() => report($getRoot().getTextContent()))
        const unregister = editor.registerTextContentListener(report)
        return () => {
            clearTimeout(timeout)
            unregister()
        }
    }, [editor, onStats])

    return null
}
