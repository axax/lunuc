import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from 'material-ui/styles'
import classNames from 'classnames'
import Drawer from 'material-ui/Drawer'
import AppBar from 'material-ui/AppBar'
import Toolbar from 'material-ui/Toolbar'
import Typography from 'material-ui/Typography'
import Divider from 'material-ui/Divider'
import IconButton from 'material-ui/IconButton'
import MenuIcon from 'material-ui-icons/Menu'
import ChevronLeftIcon from 'material-ui-icons/ChevronLeft'
import ChevronRightIcon from 'material-ui-icons/ChevronRight'

const DRAWER_WIDTH_LARGE = '800px'
const DRAWER_WIDTH_MEDIUM = '400px'
const DRAWER_WIDTH_SMALL = '300px'

const styles = theme => ({
    root: {
        width: '100%',
        height: '100%',
        zIndex: 1,
        overflow: 'hidden',
    },
    appFrame: {
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
    },
    appBar: {
        position: 'absolute',
        maxWidth: '100%',
        zIndex: theme.zIndex.drawer + 1,
        transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
    },
    smallAppBarShift: {
        width: `calc(100% - ${DRAWER_WIDTH_SMALL})`
    },
    mediumAppBarShift: {
        width: `calc(100% - ${DRAWER_WIDTH_MEDIUM})`
    },
    largeAppBarShift: {
        width: `calc(100% - ${DRAWER_WIDTH_LARGE})`
    },
    menuButton: {
        marginLeft: 12,
        marginRight: 36,
    },
    hide: {
        display: 'none',
    },
    drawerDocked: {
        maxWidth: "100%",
    },
    drawerPaper: {
        display: 'block',
        position: 'relative',
        height: '100%',
        maxWidth: '100%',
        transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
        }),
    },
    smallDrawerPaper: {
        width: DRAWER_WIDTH_SMALL,
    },
    mediumDrawerPaper: {
        width: DRAWER_WIDTH_MEDIUM,
    },
    largeDrawerPaper: {
        width: DRAWER_WIDTH_LARGE,
        flex: '1 auto'
    },
    drawerPaperClose: {
        width: 0,
        overflowY: 'hidden',
        height: window.innerHeight, /* otherwise with width=0, in some brower, the height get enormuous */
        transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
    },
    drawerInner: {
        maxWidth: '100%',
    },
    smallDrawerInner: {
        width: DRAWER_WIDTH_SMALL,
    },
    mediumDrawerInner: {
        width: DRAWER_WIDTH_MEDIUM,
    },
    largeDrawerInner: {
        width: DRAWER_WIDTH_LARGE,
    },
    drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 8px',
        ...theme.mixins.toolbar,
    },
    content: {
        boxSizing: 'border-box',
        width: '100%',
        flexGrow: 1,
        backgroundColor: theme.palette.background.default,
        padding: 24,
        height: 'calc(100% - 56px)',
        marginTop: 56,
        [theme.breakpoints.up('sm')]: {
            height: 'calc(100% - 64px)',
            marginTop: 64,
        },
    },
})

class DrawerLayout extends React.Component {
    state = {
        open: false,
    }

    handleDrawerOpen = () => {
        this.setState({open: true})
    }

    handleDrawerClose = () => {
        this.setState({open: false})
    }

    render() {
        const {classes, theme, title, sidebar, toolbarRight, children, fixHeader} = this.props
        const {open} = this.state

        const drawerSize = this.props.drawerSize || 'medium'

        const appBarStyle = {}
        if (fixHeader) {
            appBarStyle.position = 'fixed'
        }
        return (
            <div className={classes.root}>
                <div className={classes.appFrame}>
                    <AppBar style={appBarStyle}
                            className={classNames(classes.appBar, open && classes[drawerSize + 'AppBarShift'])}>
                        <Toolbar>
                            <IconButton
                                color="inherit"
                                aria-label="open drawer"
                                onClick={this.handleDrawerOpen}
                                className={classNames(classes.menuButton, open && classes.hide)}
                            >
                                <MenuIcon />
                            </IconButton>
                            <Typography variant="title" color="inherit" noWrap style={{flex: 1}}>
                                {title}
                            </Typography>
                            {toolbarRight}
                        </Toolbar>

                    </AppBar>
                    <Drawer
                        variant="permanent"
                        classes={{
                            docked: classes.drawerDocked,
                            paper: classNames(classes.drawerPaper, classes[drawerSize + 'DrawerPaper'], !open && classes.drawerPaperClose),
                        }}
                        open={open}
                    >
                        <div className={ classNames(classes.drawerInner, classes[drawerSize + 'DrawerInner']) }>
                            <div className={classes.drawerHeader}>
                                <IconButton onClick={this.handleDrawerClose}>
                                    {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                                </IconButton>
                            </div>
                            <Divider />
                            {sidebar}
                        </div>
                    </Drawer>
                    <main className={classes.content}>
                        {children}
                    </main>
                </div>
            </div>
        )
    }
}

DrawerLayout.propTypes = {
    classes: PropTypes.object.isRequired,
    theme: PropTypes.object.isRequired,
    fixHeader: PropTypes.boolean
}

export default withStyles(styles, {withTheme: true})(DrawerLayout);