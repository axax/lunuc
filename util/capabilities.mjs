import Hook from './hook.cjs'


/*
 Here are all core user capabilities listed. Use hook userCapabilities to add custom capabilities
 */

export const CAPABILITY_VIEW_APP = 'view_app'
export const CAPABILITY_ACCESS_ADMIN_PAGE = 'access_admin_page'
export const CAPABILITY_MANAGE_TYPES = 'manage_types'
export const CAPABILITY_MANAGE_KEYVALUES = 'manage_keyvalues'
export const CAPABILITY_MANAGE_OTHER_USERS = 'manage_other_users'
export const CAPABILITY_MANAGE_SAME_GROUP = 'manage_same_group'
export const CAPABILITY_MANAGE_COLLECTION = 'manage_collection'
export const CAPABILITY_MANAGE_USER_ROLE = 'manage_user_role'
export const CAPABILITY_MANAGE_USER_GROUP = 'manage_user_group'
export const CAPABILITY_MANAGE_BACKUPS = 'manage_backups'
export const CAPABILITY_SET_INITIAL_PASSWORD = 'set_initial_password'
export const CAPABILITY_BULK_EDIT = 'bulk_edit'
export const CAPABILITY_BULK_EDIT_SCRIPT = 'bulk_edit_script'
export const CAPABILITY_RUN_COMMAND = 'run_command'
export const CAPABILITY_RUN_SCRIPT = 'run_script'
export const CAPABILITY_EXTRA_OPTIONS = 'extra_options'
export const CAPABILITY_ADMIN_OPTIONS = 'admin_options'

let _allCapabilities = false

export const getAllCapabilites = () =>{

    if( !_allCapabilities ){
        _allCapabilities = [CAPABILITY_SET_INITIAL_PASSWORD, CAPABILITY_VIEW_APP, CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES, CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_MANAGE_SAME_GROUP,
            CAPABILITY_MANAGE_COLLECTION, CAPABILITY_BULK_EDIT_SCRIPT, CAPABILITY_BULK_EDIT, CAPABILITY_MANAGE_USER_ROLE, CAPABILITY_MANAGE_BACKUPS, CAPABILITY_RUN_COMMAND, CAPABILITY_RUN_SCRIPT, CAPABILITY_EXTRA_OPTIONS, CAPABILITY_ADMIN_OPTIONS]
        Hook.call('userCapabilities', {capabilities: _allCapabilities})
    }

    return _allCapabilities
}
