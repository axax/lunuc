export const addCleanHtmlPlugin = ()=> {
    tinymce.PluginManager.add("cleanhtml", function (editor, url) {

        /*
        Add a custom icon to TinyMCE
         */
        editor.ui.registry.addIcon('cleanhtml', '<svg height="24" width="24"><path d="M8 4V20M17 12V20M6 20H10M15 20H19M13 7V4H3V7M21 14V12H13V14" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>');

        const option = {
            icon: 'cleanhtml',
            title: 'Reiner Text',
            text: 'Reiner Text',
            tooltip: 'In reinen Text umwandeln',
            onAction: () => {
                let content = editor.getContent();
                content = content.replace(/<[^>]*>?/gm, ' ').replace(/ +(?= )/g,'')
                editor.setContent(content)
            }
        }

        // Add a button into the toolbar
        editor.ui.registry.addButton('cleanhtml', option);

        // Add a button into the menu bar
        editor.ui.registry.addMenuItem('cleanhtml', {
            ...option,
            context: 'format'
        })

        return {
            getMetadata: function () {
                return {
                    name: "Clean HTML Plugin"
                }
            }
        }
    })
}