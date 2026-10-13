import {useEffect, useRef} from 'react'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'

const USER_EVENTS = ['keydown', 'pointerdown', 'paste', 'drop', 'cut', 'input']

/**
 * Wie OnChangePlugin, meldet aber nur Änderungen, nachdem der Benutzer
 * tatsächlich mit dem Editor interagiert hat.
 *
 * Hintergrund: Beim Laden normalisieren Plugins (Code-Highlighting, Tabellen, AutoLink …)
 * den gespeicherten Inhalt. Diese Updates würden sonst als Änderung erkannt und
 * jeder Post würde schon beim Anklicken gespeichert.
 */
export default function UserChangePlugin({onChange, containerRef, interactionRef}) {
    const [editor] = useLexicalComposerContext()
    const interacted = useRef(false)

    useEffect(() => {
        if (interactionRef) {
            // erlaubt programmatische Änderungen (z.B. Markdown-Import) als Benutzeraktion zu markieren
            interactionRef.current = () => {
                interacted.current = true
            }
        }
        const container = containerRef && containerRef.current
        if (!container) {
            return
        }
        const mark = () => {
            interacted.current = true
        }
        USER_EVENTS.forEach(ev => container.addEventListener(ev, mark, true))
        return () => USER_EVENTS.forEach(ev => container.removeEventListener(ev, mark, true))
    }, [containerRef, interactionRef])

    useEffect(() => {
        return editor.registerUpdateListener(({editorState, dirtyElements, dirtyLeaves, prevEditorState, tags}) => {
            if (!interacted.current) {
                return
            }
            if ((dirtyElements.size === 0 && dirtyLeaves.size === 0) || tags.has('history-merge') || prevEditorState.isEmpty()) {
                return
            }
            onChange(editorState.toJSON())
        })
    }, [editor, onChange])

    return null
}
