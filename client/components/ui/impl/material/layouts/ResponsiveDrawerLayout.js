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
    drawerHeader: theme.mixins.toolbar,
    drawerPaper: {
        width: drawerWidth,
        [theme.breakpoints.up('lg')]: {
            width: drawerWidth,
            position: 'fixed',
            height: '100%',
        },
    },
    content: {
        position:'relative',
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

    if (contextLang === _app_.lang) {
        currentLink = currentLink.substring(3)
    }

    let maybeItem = null
    for (let i = 0; i < props.menuItems.length; i++) {
        const item = props.menuItems[i]
        if ( item.to) {
            const to = removeTrailingSlash(item.to)
            if (to === currentLink) {
                // exact match
                return item
            } else if (currentLink.startsWith(to)) {
                // take the longest one
                if (!maybeItem || item.to.length > maybeItem.to.length) {
                    maybeItem = item
                }
            }
        }
    }
    return maybeItem
}

const ResponsiveDrawer = (props) => {

    const [mobileOpen, setMobileOpen] = useState(false)

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen)
    }

    const {menuItems, isAuthenticated, children, headerRight, title, toolbarStyle, headerStyle} = props

    const classes = useStyles()

    const activeItem = findActiveItem(props)
    const history = useHistory()
    const drawer = (
        <div>

            <div className={classes.drawerHeader}/>
            <Divider/>
            <List>

                {menuItems.map((item, i) => {
                    if (item.auth && isAuthenticated || !item.auth) {
                        if( item.divider){
                            return <Divider key={i}/>
                        }
                        return <ListItem onClick={() => {
                            history.push(item.to)
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
                        </ListItem>

                    }
                })}

            </List>
            <Divider/>
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
