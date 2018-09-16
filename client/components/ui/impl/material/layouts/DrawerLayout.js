import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from '@material-ui/core/styles'
import classNames from 'classnames'
import Drawer from '@material-ui/core/Drawer'
import AppBar from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Typography from '@material-ui/core/Typography'
import Divider from '@material-ui/core/Divider'
import IconButton from '@material-ui/core/IconButton'
import MenuIcon from '@material-ui/icons/Menu'
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft'
import ChevronRightIcon from '@material-ui/icons/ChevronRight'

const DRAWER_WIDTH_DEFAULT = 400

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
    appBarFixed: {
        position: 'fixed'
    },
    menuButton: {
        marginLeft: 12,
        marginRight: 36,
    },
    hide: {
        display: 'none',
    },
    drawerDocked: {
        maxWidth: '100%'
    },
    drawerDockedFixed: {
        position: 'fixed',
        top: '0px',
        bottom: '0px',
        zIndex: 2
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
        position: 'relative'
    },
    drawerHeader: {
        backgroundColor: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 8px',
        ...theme.mixins.toolbar,
    },
    drawerDivider: {
        position: 'absolute',
        width: '3px',
        background: 'black',
        right: 0,
        top: 0,
        bottom: 0,
        cursor: 'ew-resize',
        zIndex: 999,
        opacity: 0,
        '&:hover': {
            opacity: 1
        }
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
        transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
    },
    contentClose: {
        transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        }),
    },
})

class DrawerLayout extends React.Component {


    constructor(props) {
        super(props)
        this.state = {
            open: false,
            drawerWidth: this.props.drawerWidth || DRAWER_WIDTH_DEFAULT
        }
    }


    handleDrawerOpen = () => {
        this.setState({open: true}, () => {
            // this is a ugly hack
            // right now it is only used for the tab indicator in the templateeditor. otherwise it is not properly placed
            // we will remove this as soon as there is a better solution
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('resize'))
            }, 20)
        })
    }

    mouseDividerPos = false

    handleDrawerClose = () => {
        this.setState({open: false})
    }

    dividerMouseDown = (e) => {
        this.mouseDividerPos = e.pageX
    }

    dividerMouseMove = (e) => {
        if (this.mouseDividerPos !== false) {
            const drawerWidth = parseFloat(this.props.drawerWidth || DRAWER_WIDTH_DEFAULT)
            this.setState({drawerWidth: drawerWidth + (e.pageX - this.mouseDividerPos)})
        }
    }

    dividerMouseUp = (e) => {
        const {onDrawerWidthChange} = this.props
        if (onDrawerWidthChange) {
            onDrawerWidthChange(this.state.drawerWidth)
        }
        this.mouseDividerPos = false
    }

    render() {
        const {classes, theme, title, sidebar, toolbarRight, children, fixedLayout} = this.props
        const {open, drawerWidth} = this.state


        const contentFixed = {}
        if (fixedLayout && open) {
            contentFixed.marginLeft = drawerWidth + 'px'
        }
        return (
            <div className={classes.root}
                 onMouseMove={this.dividerMouseMove}
                 onMouseUp={this.dividerMouseUp}>
                <div className={classes.appFrame}>
                    <AppBar
                        className={classNames(classes.appBar, fixedLayout && classes.appBarFixed)}
                        style={open ? {width: `calc(100% - ${drawerWidth}px)`} : {}}
                    >
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
                            docked: classNames(classes.drawerDocked, fixedLayout && classes.drawerDockedFixed),
                            paper: classNames(classes.drawerPaper, !open && classes.drawerPaperClose),
                        }}
                        open={open}
                    >
                        <div className={ classNames(classes.drawerInner) } style={{width: drawerWidth + 'px'}}>
                            <div className={classes.drawerHeader}>
                                <IconButton onClick={this.handleDrawerClose}>
                                    {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                                </IconButton>
                            </div>
                            <Divider />
                            {open && sidebar}
                            <div className={classes.drawerDivider}
                                 onMouseDown={this.dividerMouseDown}></div>
                        </div>
                    </Drawer>
                    <main style={contentFixed}
                          className={classNames(classes.content, fixedLayout && !open && classes.contentClose)}>
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
    fixedLayout: PropTypes.bool,
    onDrawerWidthChange: PropTypes.func,
    drawerWidth: PropTypes.number
}


export default withStyles(styles, {withTheme: true})(DrawerLayout);