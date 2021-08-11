import PropTypes from 'prop-types'
import {makeStyles} from '@material-ui/core/styles'
import Drawer from '@material-ui/core/Drawer'
import AppBar from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import IconButton from '@material-ui/core/IconButton'
import Hidden from '@material-ui/core/Hidden'
import Divider from '@material-ui/core/Divider'
import MenuIcon from '@material-ui/icons/Menu'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import {connect} from 'react-redux'
import {useHistory} from 'react-router-dom'
import React, {useState} from 'react'
import Util from '../../../../../util'
import ExpandLess from '@material-ui/icons/ExpandLess'
import ExpandMore from '@material-ui/icons/ExpandMore'
import Collapse from '@material-ui/core/Collapse'

const drawerWidth = 300;

const useStyles = makeStyles(theme => ({
    root: {
        width: '100%',
        height: '100%',
        zIndex: 1,
        overflow: 'hidden'
    },
    appFrame: {
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
    },
    appBar: {
        position: 'fixed',
        marginLeft: drawerWidth,
        [theme.breakpoints.up('lg')]: {
            width: `calc(100% - ${drawerWidth}px)`,
        },
    },
    flex: {
        flex: 1,
    },
    navIconHide: {
        [theme.breakpoints.up('lg')]: {
            display: 'none',
        },
    },
    drawerLogo: {
        height: '3rem'
    },
    drawerHeaderLeft: {
        marginLeft: 'auto'
    },
    drawerHeader: {
        ...theme.mixins.toolbar,
        padding: '0.5rem',
        display: 'flex'
    },
    drawerPaper: {
        width: drawerWidth,
        [theme.breakpoints.up('lg')]: {
            width: drawerWidth,
            position: 'fixed',
            height: '100%',
        },
    },
    content: {
        position: 'relative',
        boxSizing: 'border-box',
        backgroundColor: theme.palette.background.default,
        width: '100%',
        padding: theme.spacing(3),
        height: 'calc(100% - 56px)',
        marginTop: 56,
        marginLeft: 0,
        [theme.breakpoints.up('lg')]: {
            height: 'calc(100% - 64px)',
            marginTop: 64,
            marginLeft: drawerWidth,
            width: `calc(100% - ${drawerWidth}px)`
        },
    },
    listItemActive: {
        fontWeight: 'bold'
    }
}))


const removeTrailingSlash = (link) => {
    if (link.endsWith('/')) {
        link = link.substring(0, link.length - 1)
    }
    return link
}

const findActiveItem = (props) => {
    let currentLink = removeTrailingSlash(window.location.pathname)
    const contextLang = currentLink.split('/')[1].toLowerCase()
    const params = Util.extractQueryParams(window.location.search.substring(1))

    if (contextLang === _app_.lang) {
        currentLink = currentLink.substring(3)
    }


    let maybeItem = null
    for (let i = 0; i < props.items.length; i++) {
        const item = props.items[i]
        if (item.to) {

            if (item.to.indexOf('?') >= 0) {
                const paramsItem = Util.extractQueryParams(item.to.split('?')[1])

                if ((params.fixType && params.fixType === paramsItem.fixType && params.meta && params.meta === paramsItem.meta) ||
                    (!params.meta && params.fixType && params.fixType === paramsItem.fixType) ||
                    (params.key && params.key === paramsItem.key)) {

                    return item
                }
            }


            const to = removeTrailingSlash(item.to)
            if (to === currentLink) {
                // exact match
                return item
            } else if (props.depth === 0 && currentLink.startsWith(to)) {
                // take the longest one
                if (!maybeItem || item.to.length > maybeItem.to.length) {
                    maybeItem = item
                }
            }
        }
    }
    return maybeItem
}


const MenuList = (props) => {
    const {items, isAuthenticated, depth} = props
    const classes = useStyles()
    const history = useHistory()
    const activeItem = findActiveItem(props)

    const initialOpen = {}
    items.map((item, i) => {
        initialOpen[i] = !!item.open
    })

    const [open, setOpen] = React.useState(initialOpen)


    return <List disablePadding={depth > 0} style={{paddingLeft: (depth * 16) + 'px'}}>
        {items.map((item, i) => {
            if (item.auth && isAuthenticated || !item.auth) {
                if (item.divider) {
                    return <Divider key={i}/>
                }
                return [<ListItem onClick={() => {
                    if(item.items){
                        setOpen(Object.assign({}, open,{[i]:!open[i]}))
                    }
                    if(item.to) {
                        history.push(item.to)
                    }
                }}
                                  key={i}
                                  button>
                    {
                        item.icon && <ListItemIcon>
                            {item.icon.constructor === String ?
                                <div dangerouslySetInnerHTML={{__html: item.icon}}/> : item.icon}
                        </ListItemIcon>
                    }
                    <ListItemText disableTypography
                                  primary={<Typography variant="subtitle1"
                                                       component="h3"
                                                       className={(activeItem === item ? classes.listItemActive : '')}>{item.name}</Typography>}/>

                    {item.actions}
                    {item.items && (item.open ? <ExpandLess /> : <ExpandMore />)}
                </ListItem>,
                    item.items && <Collapse in={open[i]} timeout="auto" unmountOnExit>
                        <MenuList items={item.items} depth={depth + 1} isAuthenticated={isAuthenticated}/>
                    </Collapse>]
            }
        })}
    </List>

}

const ResponsiveDrawer = (props) => {

    const [mobileOpen, setMobileOpen] = useState(false)

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen)
    }

    const {menuItems, isAuthenticated, children, headerLeft, headerRight, title, logo, toolbarStyle, headerStyle, extra} = props

    const classes = useStyles()

    const drawer = (
        <div>
            <div className={classes.drawerHeader}>

                {logo && <img className={classes.drawerLogo} src={logo}/>}
                <div className={classes.drawerHeaderLeft}>{headerLeft}</div>
            </div>
            <Divider/>
            <MenuList depth={0} items={menuItems} isAuthenticated={isAuthenticated}/>
            <Divider/>
            {extra}
        </div>
    )

    return (
        <div className={classes.root}>
            <div className={classes.appFrame}>
                <AppBar style={headerStyle} className={classes.appBar}>
                    <Toolbar style={toolbarStyle}>

                        <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            onClick={handleDrawerToggle}
                            className={classes.navIconHide}
                        >
                            <MenuIcon/>
                        </IconButton>
                        <Typography className={classes.flex} variant="h6" color="inherit" noWrap>
                            {title}
                        </Typography>

                        {headerRight}


                    </Toolbar>
                </AppBar>
                <Hidden lgUp>
                    <Drawer
                        variant="temporary"
                        open={mobileOpen}
                        classes={{
                            paper: classes.drawerPaper,
                        }}
                        onClose={handleDrawerToggle}
                        ModalProps={{
                            keepMounted: true, // Better open performance on mobile.
                        }}
                    >
                        {drawer}
                    </Drawer>
                </Hidden>
                <Hidden mdDown implementation="css">
                    <Drawer
                        variant="permanent"
                        open
                        classes={{
                            paper: classes.drawerPaper,
                        }}
                    >
                        {drawer}
                    </Drawer>
                </Hidden>
                <main className={classes.content}>
                    {children}
                </main>
            </div>
        </div>
    )

}

ResponsiveDrawer.propTypes = {
    menuItems: PropTypes.array.isRequired,
    isAuthenticated: PropTypes.bool,
    headerRight: PropTypes.any,
    title: PropTypes.string,
    headerStyle: PropTypes.object,
    toolbarStyle: PropTypes.object
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    const {user} = store
    return {
        isAuthenticated: user.isAuthenticated
    }
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(ResponsiveDrawer)
