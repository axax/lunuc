import React from 'react'
import {
    Button,
    ResponsiveDrawerLayout,
    IconButton,
    HomeIcon,
    BuildIcon,
    SettingsIcon,
    AccountCircleIcon,
    SimpleDialog,
    SimpleMenu,
    BackupIcon,
    EditIcon,
    InsertDriveFileIcon,
    FolderIcon,
    SubjectIcon,
    ChatIcon,
    LaunchIcon,
    ShoppingCartIcon,
    WebIcon,
    ImageIcon,
    DoneIcon,
    ViewListIcon,
    ViewModuleIcon,
    LabelIcon,
    BusinessIcon,
    EventIcon,
    SchoolIcon,
    ScheduleIcon,
    ShopIcon,
    BeachAccessIcon,
    GroupIcon,
    ThumbUpIcon,
    SettingsInputComponentIcon,
    TrainIcon,
    TrafficIcon,
    MailIcon,
    CardMembershipIcon,
    MoneyIcon,
    BarChartIcon,
    StoreIcon,
    HouseIcon,
    WorkIcon,
    LocalCafeIcon,
    SportsTennisIcon,
    AccessibleIcon,
    AccountBalanceIcon,
    DirectionsBoatIcon,
    FilterListIcon,
    CasinoIcon,
    SaveIcon,
    BookIcon
} from 'ui/admin'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'
import {UIProvider} from 'ui/admin'
import 'gen/extensions-client-admin'
import {Link} from '../../util/route'
import {useKeyValues, setKeyValue} from '../../util/keyvalue'
import {CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities.mjs'

const {ADMIN_BASE_URL, APP_NAME} = config

import {_t, registerTrs} from 'util/i18n.mjs'
import {translations} from '../../translations/admin'
import {propertyByPath} from '../../util/json.mjs'
import Async from 'client/components/Async'
import {deepMergeOptional} from '../../../util/deepMerge.mjs'


const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../CodeEditor')}/>


registerTrs(translations, 'AdminTranslations')

const iconComponents = {
    home: HomeIcon,
    build: BuildIcon,
    settings: SettingsIcon,
    account: AccountCircleIcon,
    edit: EditIcon,
    drive: InsertDriveFileIcon,
    folder: FolderIcon,
    subject: SubjectIcon,
    chat: ChatIcon,
    launch: LaunchIcon,
    web: WebIcon,
    cart: ShoppingCartIcon,
    image: ImageIcon,
    done: DoneIcon,
    view: ViewListIcon,
    module: ViewModuleIcon,
    label: LabelIcon,
    business: BusinessIcon,
    event: EventIcon,
    school: SchoolIcon,
    schedule: ScheduleIcon,
    shop: ShopIcon,
    beach: BeachAccessIcon,
    group: GroupIcon,
    thumbup: ThumbUpIcon,
    component: SettingsInputComponentIcon,
    train: TrainIcon,
    traffic: TrafficIcon,
    mail: MailIcon,
    member: CardMembershipIcon,
    money: MoneyIcon,
    store: StoreIcon,
    barchart: BarChartIcon,
    house: HouseIcon,
    work: WorkIcon,
    cafe: LocalCafeIcon,
    sport: SportsTennisIcon,
    accessible: AccessibleIcon,
    politics: AccountBalanceIcon,
    boat: DirectionsBoatIcon,
    filter: FilterListIcon,
    casino: CasinoIcon,
    book: BookIcon,
    save: SaveIcon
}

const genMenuEntry = (item, path) => {
    if (!item) {
        return
    }

    if (item.constructor === Array) {
        return item.map((singleItem, index) => genMenuEntry(singleItem, path + '.' + index))
    }

    if (item.divider) {
        return item
    }
    const Icon = iconComponents[item.icon] || SettingsIcon

    let to

    if (item.to) {
        to = item.to
    } else if (item.name) {
        to = `${ADMIN_BASE_URL}/types/GenericData?fixType=GenericData&title=${encodeURIComponent(item.label || item.name)}${item.sort?'&s='+item.sort:''}&meta=${item.name}${item.baseFilter ? '&baseFilter=' + encodeURIComponent(item.baseFilter) : ''}`
    } else if (item.type) {
        to = `${ADMIN_BASE_URL}/types/${item.type}?fixType=${item.type}${item.sort?'&s='+item.sort:''}&title=${encodeURIComponent(item.label || item.type)}${item.baseFilter ? '&baseFilter=' + encodeURIComponent(item.baseFilter) : ''}`
    }

    return {
        name: item.label || item.type,
        to,
        auth: true,
        icon: <Icon/>,
        items: genMenuEntry(item.items, path + '.items'),
        path,
        open: item.open
    }
}

const BaseLayout = props => {
    const {children} = props

    const isAuthenticated = !!_app_.user
    const user = _app_.user || {}

    const keys = []
    let useKeySettings = {}

    if (user && user.setting && user.setting.length > 0) {
        user.setting.forEach(k => {
            keys.push('BaseLayoutSettings-' + k._id)
        })
        useKeySettings.global = true
    }

    keys.push('BaseLayoutSettings')


    const userKeys = useKeyValues(keys, useKeySettings)

    const [openMenuEditor, setOpenMenuEditor] = React.useState(undefined)

    const handleOpenMenuEditor = () => {
        setOpenMenuEditor(true)
    }

    let menuEditor
    const handleCloseMenuEditor = (p) => {
        if (p.key === 'save') {
            if (menuEditor) {

                if (menuEditor.state.stateError) {
                    return
                }

                setKeyValue({key: 'BaseLayoutSettings', value: menuEditor.state.data, clearCache:true}).then(() => {
                    location.href = location.href
                })


            }


        }
        setOpenMenuEditor(false)
    }

    let settings = {}
    if(!userKeys.loading && userKeys.data ){
        const userSettings = userKeys.data.BaseLayoutSettings || {}

        let inheritedSettings = {}

        Object.keys(userKeys.data).forEach(k=>{
            if(k!=='BaseLayoutSettings') {
                inheritedSettings = deepMergeOptional({concatArrays: true}, inheritedSettings, userKeys.data[k])
            }
        })
        settings = deepMergeOptional({concatArrays: false}, inheritedSettings, userSettings)
    }

    const menuItems = [
        {
            name: 'Home',
            key: 'home',
            to: ADMIN_BASE_URL + '/',
            icon: <HomeIcon/>
        },
        {name: 'Profile', to: ADMIN_BASE_URL + '/profile', auth: true, icon: <AccountCircleIcon/>}
    ]


    const capabilities = (user.role && user.role.capabilities) || []

    if (capabilities.indexOf(CAPABILITY_MANAGE_TYPES) >= 0) {

        menuItems.push(
            {name: 'System', to: ADMIN_BASE_URL + '/system', auth: true, icon: <SettingsIcon/>},
            {name: 'Files', to: ADMIN_BASE_URL + '/files', auth: true, icon: <InsertDriveFileIcon/>},
            {name: 'Backup', to: ADMIN_BASE_URL + '/backup', auth: true, icon: <BackupIcon/>},
            {name: 'Types', to: ADMIN_BASE_URL + '/types', auth: true, icon: <BuildIcon/>})
    }


    Hook.call('MenuMenu', {menuItems})

    if (settings.menu) {

        if (settings.menu.items) {

            settings.menu.items.forEach((item, i) => {
                let existingItem
                if (item.key) {
                    const existingItems = menuItems.filter(m => m.key === item.key)
                    if (existingItems.length > 0) {
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
                        existingItem.items.push(...genMenuEntry(item.items, 'items.' + i))
                    }

                } else {
                    // add new menu item
                    menuItems.push(genMenuEntry(item, 'items.' + i))
                }

            })
        }

        if (settings.menu.genericTypes) {
            menuItems.push({divider: true, auth: true})

            settings.menu.genericTypes.forEach((item, i) => {
                menuItems.push(genMenuEntry(item, 'genericTypes.' + i))
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

    if (isAuthenticated) {
        headerRight.push(<Button key="logout" color="inherit" size="small"
                                 onClick={() => {
                                     _app_.history.push(ADMIN_BASE_URL + '/logout')
                                 }}>Logout {username}</Button>)
    } else {
        headerRight.push(<Button key="login" color="inherit" size="small"
                                 onClick={() => {
                                     _app_.history.push(ADMIN_BASE_URL + '/login')
                                 }}>Login</Button>)
    }

    if (!settings.headerActions) {
        settings.headerActions = [{
            to: '/',
            icon: 'home'
        }]
    }

    settings.headerActions.forEach((item, index) => {
        const Icon = iconComponents[item.icon] || SettingsIcon
        headerRight.push(
            <IconButton key={'headerAction' + index}
                        onClick={() => {

                            _app_.history.push(item.to)
                        }}
                        color="inherit"><Icon/></IconButton>
        )
    })


    console.log('Render BaseLayout')

    return <UIProvider>
        <ResponsiveDrawerLayout title={settings.title || APP_NAME}
                                logo={settings.logo}
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
                                extra={!userKeys.loading && settings.history !== false && _app_.history._urlStack && _app_.history._urlStack.length > 0 &&
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

            {!userKeys.loading && <ErrorHandler/>}
            {!userKeys.loading && <NotificationHandler/>}
            {!userKeys.loading && <NetworkStatusHandler/>}
            {children}
        </ResponsiveDrawerLayout>
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

            <CodeEditor lineNumbers type="json" forceJson={true} onForwardRef={(e) => {
                menuEditor = e
            }}>
                {settings}
            </CodeEditor>
        </SimpleDialog>}
    </UIProvider>

}


export default BaseLayout
