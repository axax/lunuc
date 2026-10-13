const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'

export const addLoremipsumPlugin = () => {
    tinymce.PluginManager.add('loremipsum', function (editor) {

        editor.ui.registry.addIcon('lorem-ipsum', '<svg height="24" width="24" viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>')

        const insert = (paragraphs) => {
            editor.insertContent(Array.from({length: paragraphs}, () => `<p>${LOREM}</p>`).join(''))
        }

        editor.ui.registry.addButton('loremipsum', {
            icon: 'lorem-ipsum',
            tooltip: 'Blindtext einfügen',
            onAction: () => insert(1)
        })

        editor.ui.registry.addNestedMenuItem('loremipsum', {
            icon: 'lorem-ipsum',
            text: 'Blindtext (Lorem ipsum)',
            getSubmenuItems: () => [1, 2, 3, 5].map(n => ({
                type: 'menuitem',
                text: n === 1 ? '1 Absatz' : `${n} Absätze`,
                onAction: () => insert(n)
            }))
        })

        return {
            getMetadata: () => ({name: 'Loremipsum Plugin'})
        }
    })
}
