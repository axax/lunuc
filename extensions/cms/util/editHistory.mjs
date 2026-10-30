/**
 * Changes that are saved outside of the cms page (e.g. the inline edited content of a GenericData entry, see
 * components/GenericDataContent) can be added to the undo / redo history of the page editor
 * (CmsViewEditorContainer listens while a page is edited):
 *
 *   pushExternalHistory({label: 'Inhalt «Titel»', undo: () => {...}, redo: () => {...}})
 *
 * Returns false if no page editor is listening (the change is then not in a history).
 */
const listeners = new Set()

export const onExternalHistory = listener => {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export const pushExternalHistory = entry => {
    if (!entry || typeof entry.undo !== 'function' || typeof entry.redo !== 'function' || listeners.size === 0) {
        return false
    }
    listeners.forEach(listener => listener(entry))
    return true
}
