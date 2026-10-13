// "Reiner Text": strips all markup but keeps paragraphs and line breaks,
// so the result stays readable. Works on the selection if there is one,
// otherwise on the whole document.
const toPlainParagraphs = (html) => {
    const div = document.createElement('div')
    div.innerHTML = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, '\n\n')
    const text = (div.textContent || '')
        .replace(/ /g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    if (!text) {
        return ''
    }
    const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return text.split(/\n{2,}/)
        .map(p => '<p>' + escape(p).replace(/\n/g, '<br>') + '</p>')
        .join('')
}

export const addCleanHtmlPlugin = () => {
    tinymce.PluginManager.add('cleanhtml', function (editor) {

        editor.ui.registry.addIcon('cleanhtml', '<svg height="24" width="24" viewBox="0 0 24 24"><path d="M8 4V20M17 12V20M6 20H10M15 20H19M13 7V4H3V7M21 14V12H13V14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>')

        const onAction = () => {
            const hasSelection = !editor.selection.isCollapsed()
            editor.undoManager.transact(() => {
                if (hasSelection) {
                    editor.insertContent(toPlainParagraphs(editor.selection.getContent()))
                } else {
                    editor.setContent(toPlainParagraphs(editor.getContent()))
                }
            })
            editor.setDirty(true)
            editor.nodeChanged()
        }

        editor.ui.registry.addButton('cleanhtml', {
            icon: 'cleanhtml',
            tooltip: 'In reinen Text umwandeln (Formatierung entfernen)',
            onAction
        })

        editor.ui.registry.addMenuItem('cleanhtml', {
            icon: 'cleanhtml',
            text: 'Reiner Text',
            onAction
        })

        return {
            getMetadata: () => ({name: 'Clean HTML Plugin'})
        }
    })
}
