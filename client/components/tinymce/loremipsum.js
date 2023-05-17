export const addLoremipsumPlugin = ()=> {
    tinymce.PluginManager.add("loremipsum", function (editor, url) {
        function li() {
            return 'Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
        }

        /*
        Add a custom icon to TinyMCE
         */
        editor.ui.registry.addIcon('lorem-ipsum', '<svg height="24" width="24"><path d="M12 0 L24 24 L0 24 Z" /></svg>');
        // Add a button into the toolbar
        editor.ui.registry.addButton('loremipsum', {
            icon: 'lorem-ipsum',
            title: 'loremipsum',
            tooltip: 'loremipsum',
            onAction: () => {
                editor.insertContent(li());
            }
        });
        // Add a button into the menu bar
        editor.ui.registry.addMenuItem('loremipsum', {
            icon: 'lorem-ipsum',
            title: 'loremipsum',
            text: 'loremipsum',
            context: 'insert',
            onAction: () => {
                editor.insertContent(li());
            }
        });
        // Return details to be displayed in TinyMCE's "Help" plugin, if you use it
        // This is optional.
        return {
            getMetadata: function () {
                return {
                    name: "Loremipsum Plugin"
                };
            }
        };
    });
}