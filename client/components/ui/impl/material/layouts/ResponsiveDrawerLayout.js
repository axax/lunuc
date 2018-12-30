import React from 'react';
import PropTypes from 'prop-types';
import {withStyles} from '@material-ui/core/styles';
import Drawer from '@material-ui/core/Drawer';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Hidden from '@material-ui/core/Hidden';
import Divider from '@material-ui/core/Divider';
import MenuIcon from '@material-ui/icons/Menu';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemIcon from '@material-ui/core/ListItemIcon'
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import {connect} from 'react-redux'

const drawerWidth = 300;

const styles = theme => ({
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
        boxSizing: 'border-box',
        backgroundColor: theme.palette.background.default,
        width: '100%',
        padding: theme.spacing.unit * 3,
        height: 'calc(100% - 56px)',
        marginTop: 56,
        marginLeft:0,
        [theme.breakpoints.up('lg')]: {
            height: 'calc(100% - 64px)',
            marginTop: 64,
            marginLeft: drawerWidth,
            width: `calc(100% - ${drawerWidth}px)`
        },
    },
    listItemActive:{
        fontWeight: 'bold'
    }
})

class ResponsiveDrawer extends React.Component {
    state = {
        mobileOpen: false,
    }

    constructor(props) {
        super(props)
        this.currentLinkParts = this.props.location.pathname.substring(config.ADMIN_BASE_URL.length + 1).split('/')
    }

    componentWillReceiveProps(nextProps) {
        this.currentLinkParts = nextProps.location.pathname.substring(config.ADMIN_BASE_URL.length + 1).split('/')
    }

    linkTo(item) {
        this.props.history.push(item.to)
    }

    isActive(link) {
        const linkCut = link.substring(config.ADMIN_BASE_URL.length + 1).split('/')
        return linkCut[0] === this.currentLinkParts[0]
    }

    handleDrawerToggle = () => {
        this.setState({mobileOpen: !this.state.mobileOpen})
    };

    render() {
        const {classes, theme, menuItems, isAuthenticated, children, headerRight, title} = this.props
        const drawer = (
            <div>

                <div className={classes.drawerHeader}/>
                <Divider />
                <List>

                    {menuItems.map((item, i) => {
                        if (item.auth && isAuthenticated || !item.auth) {
                            const isActive = this.isActive(item.to)
                            return <ListItem onClick={this.linkTo.bind(this, item)}
                                             key={i}
                                             button>
                                    {
                                        item.icon &&  <ListItemIcon>
                                            {item.icon}
                                        </ListItemIcon>
                                    }
                                <ListItemText disableTypography
                                              primary={<Typography variant="subtitle1"
                                                                   component="h3"
                                                                   className={(isActive ? classes.listItemActive: '')}>{item.name}</Typography>}/>
                            </ListItem>

                        }
                    })}
                </List>
                <Divider />
            </div>
        )

        return (
            <div className={classes.root}>
                <div className={classes.appFrame}>
                    <AppBar className={classes.appBar}>
                        <Toolbar>

                            <IconButton
                                color="inherit"
                                aria-label="open drawer"
                                onClick={this.handleDrawerToggle}
                                className={classes.navIconHide}
                            >
                                <MenuIcon />
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
                            anchor={theme.direction === 'rtl' ? 'right' : 'left'}
                            open={this.state.mobileOpen}
                            classes={{
                                paper: classes.drawerPaper,
                            }}
                            onClose={this.handleDrawerToggle}
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
        );
    }
}

ResponsiveDrawer.propTypes = {
    classes: PropTypes.object.isRequired,
    history: PropTypes.object.isRequired,
    theme: PropTypes.object.isRequired,
    menuItems: PropTypes.array.isRequired,
    isAuthenticated: PropTypes.bool,
    headerRight: PropTypes.any,
    title: PropTypes.string
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
)(withRouter(withStyles(styles, {withTheme: true})(ResponsiveDrawer)))