import React, {useEffect} from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import {
    Button,
    ResponsiveDrawerLayout,
    HomeIconButton,
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
    BeachAccessIcon
} from 'ui/admin'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import Hook from 'util/hook'
import config from 'gen/config-client'
import * as UserActions from 'client/actions/UserAction'
import {UIProvider} from 'ui/admin'
import 'gen/extensions-client-admin'
import {useHistory} from 'react-router-dom'
import {Link} from 'react-router-dom'
import {useKeyValues, setKeyValue} from '../../util/keyvalue'
import {CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities'

const {ADMIN_BASE_URL, APP_NAME} = config

import {_t, registerTrs} from 'util/i18n'
import {translations} from '../../translations/admin'
import CodeEditor from '../CodeEditor'
import {propertyByPath} from '../../util/json'

registerTrs(translations, 'AdminTranslations')

const iconComponents = {
    home: HomeIconButton,
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
    beach: BeachAccessIcon
}

const BaseLayout = props => {
    const {children, isAuthenticated, user} = props

    const userKeys = useKeyValues(['BaseLayoutSettings'])

    const [openMenuEditor, setOpenMenuEditor] = React.useState(false)

    const handleOpenMenuEditor = () => {
        setOpenMenuEditor(true)
    }

    let newSettings, menuEditor
    const handleCloseMenuEditor = (p) => {
        if (p.key === 'save') {
            if (menuEditor) {

                if (menuEditor.state.stateError) {
                    return
                }

                setKeyValue({key: 'BaseLayoutSettings', value: menuEditor.state.data}).then(() => {
                    location.href = location.href
                })


            }


        }
        setOpenMenuEditor(false)
    }
    const settings = userKeys.data && userKeys.data.BaseLayoutSettings || {}

    const menuItems = [
        {
            name: 'Home',
            key: 'home',
            to: ADMIN_BASE_URL + '/',
            icon: <HomeIcon/>
        },
        {name: 'Profile', to: ADMIN_BASE_URL + '/profile', auth: true, icon: <AccountCircleIcon/>}
    ]


    const capabilities = (user.userData && user.userData.role && user.userData.role.capabilities) || []

    if (capabilities.indexOf(CAPABILITY_MANAGE_TYPES) >= 0) {

        menuItems.push(
            {name: 'System', to: ADMIN_BASE_URL + '/system', auth: true, icon: <SettingsIcon/>},
            {name: 'Files', to: ADMIN_BASE_URL + '/files', auth: true, icon: <InsertDriveFileIcon/>},
            {name: 'Backup', to: ADMIN_BASE_URL + '/backup', auth: true, icon: <BackupIcon/>},
            {name: 'Types', to: ADMIN_BASE_URL + '/types', auth: true, icon: <BuildIcon/>})
    }


    Hook.call('MenuMenu', {menuItems, user})

    if (settings.menu) {

        const genMenuEntry = (item, path) => {
            if (!item) {
                return
            }

            if (item.constructor === Array) {
                return item.map((singleItem, index) => genMenuEntry(singleItem, path+'.'+index))
            }

            if (item.divider) {
                return item
            }
            const Icon = iconComponents[item.icon] || SettingsIcon

            let to

            if (item.to) {
                to = item.to
            } else if (item.name) {
                to = `${ADMIN_BASE_URL}/types/GenericData?fixType=GenericData&title=${encodeURIComponent(item.label || item.name)}&meta=${item.name}${item.baseFilter?'&baseFilter='+encodeURIComponent(item.baseFilter):''}`
            } else if (item.type) {
                to = `${ADMIN_BASE_URL}/types/${item.type}?fixType=${item.type}&title=${encodeURIComponent(item.label || item.type)}`
            }

            return {
                name: item.label || item.type,
                to,
                auth: true,
                icon: <Icon/>,
                items: genMenuEntry(item.items, path+'.items'),
                path,
                open: item.open
            }
        }

        if (settings.menu.items) {

            settings.menu.items.forEach((item, i) => {
                let existingItem
                if (item.key) {
                    const existingItems = menuItems.filter(m => m.key === item.key)
                    if (existingItems.length > 0) {
                        existingItem = existingItems[0]
                        existingItem.path = 'items.'+i
                        existingItem.open = item.open
                    }
                }

                if (existingItem) {
                    // extend menu item
                    if (item.items) {
                        if (!existingItem.items) {
                            existingItem.items = []
                        }
                        existingItem.items.push(...genMenuEntry(item.items, 'items.'+i))
                    }

                } else {
                    // add new menu item
                    menuItems.push(genMenuEntry(item, 'items.'+i))
                }

            })
        }

        if (settings.menu.genericTypes) {
            menuItems.push({divider: true, auth: true})

            settings.menu.genericTypes.forEach((item,i) => {
                menuItems.push(genMenuEntry(item,'genericTypes.'+i))
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

    const username = user.userData ? user.userData.username : ''

    const history = useHistory()

    return <UIProvider>
        <ResponsiveDrawerLayout title={settings.title || APP_NAME}
                                logo={settings.logo}
                                menuItems={menuItems}
                                onMenuChange={(item,open)=>{
                                    if(item.path) {
                                        const oriItem = propertyByPath(item.path, settings.menu)
                                        if(oriItem){
                                            oriItem.open = open
                                            setKeyValue({key: 'BaseLayoutSettings', value: settings})
                                        }
                                    }
                                }}
                                extra={!userKeys.loading && settings.history !== false && history._urlStack && history._urlStack.length > 0 &&
                                <div style={{
                                    padding: '1rem',
                                    border: '1px solid #f1f1f1',
                                    margin: '1rem',
                                    fontSize: '0.8rem'
                                }}>{history._urlStack.map((u, i) => {
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
                                    }
                                ]}/>}
                                headerRight={
                                    [
                                        (isAuthenticated ?
                                            <Button key="logout" color="inherit" size="small"
                                                    onClick={() => {
                                                        history.push(ADMIN_BASE_URL + '/logout')
                                                    }}>Logout {username}</Button>

                                            : <Button key="login" color="inherit" size="small"
                                                      onClick={() => {
                                                          history.push(ADMIN_BASE_URL + '/login')
                                                      }}>Login</Button>),
                                        <HomeIconButton
                                            key="home"
                                            onClick={() => {
                                                history.push('/')
                                            }}
                                            color="inherit"/>
                                    ]
                                }>

            <ErrorHandler/>
            <NotificationHandler/>
            <NetworkStatusHandler/>
            <SimpleDialog
                fullWidth={true} maxWidth="lg"
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
                <CodeEditor lineNumbers type="json" forceJson={true} ref={(e) => {
                    menuEditor = e
                }}>
                    {settings}
                </CodeEditor>
            </SimpleDialog>

            {children}
        </ResponsiveDrawerLayout>
    </UIProvider>

}


BaseLayout.propTypes = {
    isAuthenticated: PropTypes.bool,
    user: PropTypes.object,
    /* User Reducer */
    userActions: PropTypes.object.isRequired,
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    const {user} = store
    return {
        isAuthenticated: user.isAuthenticated,
        user
    }
}


/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    userActions: bindActionCreators(UserActions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(BaseLayout)
