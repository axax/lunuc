import React,{useRef} from 'react'
import {
    Box,
    Badge,
    Avatar,
    Button,
    ResponsiveDrawerLayout,
    IconButton,
    HomeIcon,
    BuildIcon,
    SettingsIcon,
    SimpleDialog,
    SimpleMenu,
    BackupIcon,
    EditIcon,
    InsertDriveFileIcon,
    DoneIcon
} from 'ui/admin'
import {getIconByKey} from '../ui/impl/material/icon'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'
import {UIProvider} from 'ui/admin'
import 'gen/extensions-client-admin'
import {Link} from '../../util/route'
import {useKeyValues, setKeyValue} from '../../util/keyvalue'
import {
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_RUN_COMMAND, CAPABILITY_EXTRA_OPTIONS
} from '../../../util/capabilities.mjs'

const {ADMIN_BASE_URL, APP_NAME} = config

import {_t, registerTrs} from 'util/i18n.mjs'
import {translations} from '../../translations/admin'
import {propertyByPath} from '../../util/json.mjs'
import Async from 'client/components/Async'
import {deepMergeOptional} from '../../../util/deepMerge.mjs'
import {getImageSrc} from '../../util/media'
import GlobalSearch from './GlobalSearch'
import Util from "../../util/index.mjs";
import GenericSettings from '../GenericSettings'
import Drawer from '@mui/material/Drawer'
import {replacePlaceholders} from '../../../util/placeholders.mjs'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../CodeEditor')}/>


registerTrs(translations, 'AdminTranslations')


const genMenuEntry = (item, path, options) => {
    if (!item) {
        return
    }

    if (item.constructor === Array) {
        return item.map((singleItem, index) => genMenuEntry(singleItem, path + '.' + index, options))
    }

    if (item.divider || item.subheader) {
        return item
    }
    const Icon = getIconByKey(item.icon, SettingsIcon)

    let to, onClick

    if(item.type==='form'){
        onClick = ()=>{
            if(options.setGenericSettings){
                options.setGenericSettings({open:true,
                    keyDefinition:replacePlaceholders(item.keyDefinition,{}),
                    keyValues:replacePlaceholders(item.keyValues,{})
                })
            }
        }
    }else if (item.to) {
        to = item.to
    } else if (item.name) {
        to = `${ADMIN_BASE_URL}/types/GenericData?fixType=GenericData&title=${encodeURIComponent(item.label || item.name)}${item.sort?'&s='+item.sort:''}&meta=${item.name}${item.baseFilter ? '&baseFilter=' + encodeURIComponent(item.baseFilter) : ''}`
    } else if (item.type) {
        to = `${ADMIN_BASE_URL}/types/${item.type}?fixType=${item.type}${item.sort?'&s='+item.sort:''}&title=${encodeURIComponent(item.label || item.type)}${item.baseFilter ? '&baseFilter=' + encodeURIComponent(item.baseFilter) : ''}`
    }

    return {
        name: item.label || item.type,
        to,
        onClick,
        auth: true,
        icon: item.badge?<Badge badgeContent={item.badge.count} color="error">
            <Icon/>
        </Badge>:<Icon />,
        items: genMenuEntry(item.items, path + '.items', options),
        path,
        open: item.open
    }
}

function getSettingsFromKeys(userKeys) {
    if (!userKeys.loading && userKeys.data) {
        const userSettings = userKeys.data.BaseLayoutSettings || {}

        let inheritedSettings = {}

        Object.keys(userKeys.data).forEach(k => {
            if (k !== 'BaseLayoutSettings') {
                inheritedSettings = deepMergeOptional({concatArrays: true}, inheritedSettings, userKeys.data[k])
            }
        })
        return deepMergeOptional({concatArrays: false}, inheritedSettings, userSettings)
    }
    return {}
}

const BaseLayout = props => {
    const {children} = props

    const user = _app_.user

    const keys = []
    let useKeySettings = {}
    if (user?.setting?.length > 0) {
        user.setting.forEach(k => {
            keys.push('BaseLayoutSettings-' + k._id)
        })
    }
    if(user?.role?.setting?.length>0){
        user.role.setting.forEach(k => {
            keys.push('BaseLayoutSettings-' + k._id)
        })
        useKeySettings.global = true
    }

    keys.push('BaseLayoutSettings')

    const userKeys = useKeyValues(keys, useKeySettings)

    const [openMenuEditor, setOpenMenuEditor] = React.useState(undefined)
    const [genericSettings, setGenericSettings] = React.useState({})

    const handleOpenMenuEditor = () => {
        setOpenMenuEditor(true)
    }

    const menuEditorRef = useRef()

    const handleCloseMenuEditor = (action) => {
        if (action.key === 'save') {
            if (menuEditorRef.current) {
                if (menuEditorRef.current.getStateError()) {
                    return
                }
                setKeyValue({key: 'BaseLayoutSettings', value: menuEditorRef.current.getValue(), clearCache:true}).then(() => {
                    location.href = location.href
                })
            }
        }
        setOpenMenuEditor(false)
    }
    let settings = getSettingsFromKeys(userKeys)

    const menuItems = [
        {
            name: 'Home',
            key: 'home',
            to: ADMIN_BASE_URL + '/',
            icon: <HomeIcon/>
        },
        /*{name: 'Profile', to: ADMIN_BASE_URL + '/profile', auth: true, icon: <AccountCircleIcon/>}*/
    ]


    const capabilities = (user.role && user.role.capabilities) || []

    if (capabilities.indexOf(CAPABILITY_MANAGE_TYPES) >= 0) {

        menuItems.push(
            {name: 'System', to: ADMIN_BASE_URL + '/system', auth: true, icon: <SettingsIcon/>},
            {name: 'Types', to: ADMIN_BASE_URL + '/types', auth: true, icon: <BuildIcon/>})
    }


    if (capabilities.indexOf(CAPABILITY_RUN_COMMAND) >= 0) {
        menuItems.push({name: 'Files', to: ADMIN_BASE_URL + '/files', auth: true, icon: <InsertDriveFileIcon/>})
    }

    if (capabilities.indexOf(CAPABILITY_MANAGE_BACKUPS) >= 0) {
        menuItems.push({name: 'Backup', to:ADMIN_BASE_URL + '/backup', auth: true, icon: <BackupIcon/>})
    }

    Hook.call('MenuMenu', {menuItems})

    if (settings.menu) {

        if (settings.menu.items) {

            settings.menu.items.forEach((item, i) => {
                let existingItem
                if (item.key) {
                    const existingItems = menuItems.filter(m => m.key === item.key)
                    if (existingItems.length > 0) {
                        if(item.remove){
                            existingItems.forEach(existingItem=>{
                                menuItems.splice(menuItems.indexOf(existingItem), 1)
                            })
                            return
                        }
                        existingItem = existingItems[0]
                        existingItem.path = 'items.' + i
                        existingItem.open = item.open
                    }
                }

                if (existingItem) {
                    // extend menu item
                    if (item.items) {
                        if (!existingItem.items) {
                            existingItem.items = []
                        }
                        existingItem.items.push(...genMenuEntry(item.items, 'items.' + i,{setGenericSettings}))
                    }

                } else {
                    // add new menu item
                    menuItems.push(genMenuEntry(item, 'items.' + i,{setGenericSettings}))
                }

            })
        }

        if (settings.menu.genericTypes && settings.menu.genericTypes.length>0) {
            menuItems.push({divider: true, auth: true})

            settings.menu.genericTypes.forEach((item, i) => {
                menuItems.push(genMenuEntry(item, 'genericTypes.' + i,{setGenericSettings}))
            })
        }

        // deprecated. will probably be removed in the future
        if (settings.menu.hide) {
            for (let i = menuItems.length - 1; i >= 0; i--) {
                if (settings.menu.hide.indexOf(menuItems[i].name) >= 0) {
                    menuItems.splice(i, 1)
                }
            }
        }
    }

    const username = user.username || ''

    const headerRight = []

    if(Util.hasCapability(_app_.user, CAPABILITY_EXTRA_OPTIONS)) {

        headerRight.push(<GlobalSearch/>)
    }


    if (!settings.headerActions) {
        settings.headerActions = [{
            to: '/',
            icon: 'home'
        }]
    }

    settings.headerActions.forEach((item, index) => {
        const Icon = getIconByKey(item.icon, SettingsIcon)
        headerRight.push(
            <IconButton key={'headerAction' + index}
                        onClick={() => {

                            _app_.history.push(item.to)
                        }}
                        color="inherit"><Icon/></IconButton>
        )
    })

    if (user.isAuthenticated) {

        const userMenuItems= [{
            name: username,
            disabled:true
        },
        {
            name: `Profile`,
            icon: 'account',
            divider:true,
            onClick: e => {
                _app_.history.push(ADMIN_BASE_URL + '/profile')
            }
        },{
            name: `Logout ${username}`,
            icon:'logout',
            onClick: e => {
                _app_.history.push(ADMIN_BASE_URL + '/logout')
            }
        }]

        Hook.call('UserMenu', {menuItems: userMenuItems})

        headerRight.push(<Box sx={{ flexGrow: 0 }}>
            <SimpleMenu
                icon={<Avatar alt={username} src={user.picture?getImageSrc(user.picture,'avatar'):''} />}
                items={userMenuItems}/>

        </Box>)
        /*headerRight.push(<Button key="logout" color="inherit" size="small"
                                 onClick={() => {
                                     _app_.history.push(ADMIN_BASE_URL + '/logout')
                                 }}>Logout {username}</Button>)*/
    } else {
        headerRight.push(<Button key="login" color="inherit" size="small"
                                 onClick={() => {
                                     _app_.history.push(ADMIN_BASE_URL + '/login')
                                 }}>Login</Button>)
    }

    console.log('Render BaseLayout')

    return <UIProvider>
        <ResponsiveDrawerLayout title={settings.title || APP_NAME}
                                logo={settings.logo}
                                contentStyle={props.contentStyle}
                                menuItems={menuItems}
                                onMenuChange={(item, open) => {
                                    if (item.path) {
                                        const oriItem = propertyByPath(item.path, settings.menu)
                                        if (oriItem) {
                                            oriItem.open = open
                                            setKeyValue({key: 'BaseLayoutSettings', value: settings, clearCache:true})
                                        }
                                    }
                                }}
                                extra={!userKeys.loading && settings.history === true && _app_.history._urlStack && _app_.history._urlStack.length > 0 &&
                                <div style={{
                                    padding: '1rem',
                                    border: '1px solid #f1f1f1',
                                    margin: '1rem',
                                    fontSize: '0.8rem'
                                }}>{_app_.history._urlStack.map((u, i) => {
                                    return <Link key={'urlstack' + i} style={{
                                        display: 'block', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        overflow: 'hidden'
                                    }} to={u}>{u}</Link>
                                })}</div>}

                                headerLeft={<SimpleMenu key="menu" mini items={[
                                    {
                                        name: _t('BaseLayout.editMenu'),
                                        onClick: handleOpenMenuEditor,
                                        icon: <EditIcon/>
                                    },
                                    {
                                        name: _t('BaseLayout.resetMenu'),
                                        onClick: ()=>{

                                            setKeyValue({key: 'BaseLayoutSettings', value: '', clearCache:true}).then(() => {
                                                location.href = location.href
                                            })
                                        },
                                        icon: <DoneIcon/>
                                    }
                                ]}/>}
                                headerRight={headerRight}>

            {<ErrorHandler/>}
            {!userKeys.loading && <NotificationHandler/>}
            {!userKeys.loading && <NetworkStatusHandler/>}
            {children}
        </ResponsiveDrawerLayout>
        <Drawer anchor="right"
                sx={{
                    zIndex: 1300,
                    '& .MuiDrawer-paper': {
                        maxWidth: '100vw',
                        minWidth: '50vw'
                    },
                }}
                disableEnforceFocus={true}
                open={genericSettings.open}
                onClose={() => {
                    setGenericSettings({})
                }}> {genericSettings.open && <GenericSettings keyValues={genericSettings.keyValues}
                                                          keyDefinition={genericSettings.keyDefinition}
                                                          onSaveValues={()=>{
                                                              location.href = location.href.split('#')[0]
                                                          }}/>}
        </Drawer>
        {openMenuEditor !== undefined && <SimpleDialog
            fullWidth={true}
            fullScreenMobile={true}
            maxWidth="lg"
            open={openMenuEditor}
            onClose={handleCloseMenuEditor}
            actions={[{
                key: 'cancel',
                label: _t('core.cancel'),
                type: 'secondary'
            },
                {
                    key: 'save',
                    label: _t('core.save'),
                    type: 'primary'
                }]}
        >

            <CodeEditor lineNumbers type="json" forceJson={true} asyncRef={menuEditorRef}>
                {settings}
            </CodeEditor>
        </SimpleDialog>}
    </UIProvider>

}


export default BaseLayout
