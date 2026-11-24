/*
 What loading the whole ui (index.js, imported as 'ui/admin') does besides its exports:
 - style.less: .file-icon classes (used e.g. by system/scan) and the tinymce z-index
 - themeState: initializes the theme mode (outside the admin only _app_.theme)
 - icons: registers the icon components for JsonDom (HomeIcon, EditIconButton ...)
 Components used on pages for visitors import single MUI components plus this file instead of the
 whole ui, so they load much less and pages behave exactly as before.
 */
import './style.less'
import './themeState'
import 'ui/admin/icons'
