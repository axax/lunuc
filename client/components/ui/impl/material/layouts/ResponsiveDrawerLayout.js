import PropTypes from 'prop-types'
import Drawer from '@mui/material/Drawer'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import MenuIcon from '@mui/icons-material/Menu'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListItemIcon from '@mui/material/ListItemIcon'
import React, {useState} from 'react'
import Util from '../../../../../util/index.mjs'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Collapse from '@mui/material/Collapse'
import styled from '@emotion/styled'
import theme from '../theme'

const drawerWidth = 300;


const StyledDrawerRoot = styled.div`
    width: 100%;
    height: 100%;
    z-index: 1;
    overflow: hidden;
`

const StyledAppFrame = styled.div`
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
`

const StyledAppBar = styled(AppBar)({
    position: 'fixed',
    marginLeft: `${drawerWidth}px`,
    [theme.breakpoints.up('lg')]: {
        width: `calc(100% - ${drawerWidth}px)`,
    }
})

const StyledDrawerContent = styled.main`
    position: relative;
    box-sizing: border-box;
    background-color: ${theme.palette.background.default};
    width: 100%;
    padding: ${theme.spacing(3)};
    height: calc(100% - 56px);
    margin-top: 56px;
    margin-feft: 0;
    ${theme.breakpoints.up('lg')} {
        height: calc(100% - 64px);
        margin-top: 64px;
        margin-left: ${drawerWidth}px;
        width: calc(100% - ${drawerWidth}px);
    }
`

const findActiveItem = (props) => {
    let currentLink = Util.removeTrailingSlash(window.location.pathname)
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
                if ((params.fixType && params.fixType === paramsItem.fixType &&
                        params.meta && params.meta === paramsItem.meta && params.title === paramsItem.title) ||
                    (!params.meta && params.fixType && params.fixType === paramsItem.fixType && params.title === paramsItem.title) ||
                    (!params.meta && !params.title && params.fixType && params.fixType === paramsItem.fixType) ||
                    (params.key && params.key === paramsItem.key)) {

                    return item
                }
            }


            const to = Util.removeTrailingSlash(item.to)
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
    const {items, depth, onMenuChange} = props
    const activeItem = findActiveItem(props)

    const [open, setOpen] = React.useState({})

    return <List disablePadding={depth > 0} style={{paddingLeft: (depth * 16) + 'px'}}>
        {items.map((item, i) => {
            if (item.auth && _app_.user || !item.auth) {
                if (item.divider) {
                    return <Divider key={i}/>
                }
                const isOpen = open[i] || (open[i]==undefined && item.open)
                return [<ListItem onClick={() => {
                    if(item.items){
                        onMenuChange(item, !isOpen)
                        setOpen(Object.assign({}, open,{[i]:!isOpen}))
                    }
                    if(item.to) {
                        _app_.history.push(item.to)
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
                                                       style={{fontWeight:(activeItem === item ? 'bold' : 'normal')}}>{item.name}</Typography>}/>

                    {item.actions}
                    {item.items && (isOpen ? <ExpandLess /> : <ExpandMore />)}
                </ListItem>,
                    item.items && <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <MenuList items={item.items} onMenuChange={onMenuChange} depth={depth + 1} isAuthenticated={!!_app_.user}/>
                    </Collapse>]
            }
        })}
    </List>

}

const ResponsiveDrawer = React.memo((props) => {

    const [mobileOpen, setMobileOpen] = useState(false)

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen)
    }
    const {onMenuChange, menuItems, children, headerLeft, headerRight, title, logo, toolbarStyle, headerStyle, extra} = props

    const drawer = (
        <div key="drawer">
            <Toolbar sx={{ padding: '0.5rem !important'}}>
                {logo && <img style={{height:'3rem'}} src={logo}/>}
                <div style={{marginLeft:'auto'}}>{headerLeft}</div>
            </Toolbar>
            <Divider/>
            <MenuList key="mainMenu" depth={0} onMenuChange={onMenuChange} items={menuItems} isAuthenticated={!!_app_.user}/>
            <Divider/>
            {extra}
        </div>
    )
    console.log('render ResponsiveDrawer')
    return (
        <StyledDrawerRoot>
            <StyledAppFrame>
                <StyledAppBar style={headerStyle}>
                    <Toolbar style={toolbarStyle}>

                        <IconButton
                            color="inherit"
                            aria-label="open drawer"
                            onClick={handleDrawerToggle}
                            sx={{display: { xs: 'block', lg: 'none' } }}
                        >
                            <MenuIcon/>
                        </IconButton>
                        <Typography sx={{display: { flex: 1 } }} variant="h6" color="inherit" noWrap>
                            {title}
                        </Typography>
                        {headerRight}
                    </Toolbar>
                </StyledAppBar>
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    sx={{
                        display: { xs: 'block', lg: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                    }}
                    onClose={handleDrawerToggle}
                    ModalProps={{
                        keepMounted: true, // Better open performance on mobile.
                    }}
                >
                    {drawer}
                </Drawer>
                <Drawer
                    variant="permanent"
                    open
                    sx={{
                        display: { xs: 'none', lg: 'block' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
                    }}>
                    {drawer}
                </Drawer>
                <StyledDrawerContent>
                    {children}
                </StyledDrawerContent>
            </StyledAppFrame>
        </StyledDrawerRoot>
    )

}, (prev, next) => {
    let equal = prev.menuItems.length === next.menuItems.length && prev.children[prev.children.length-1] === next.children[next.children.length-1]

    return equal
})

ResponsiveDrawer.propTypes = {
    menuItems: PropTypes.array.isRequired,
    headerRight: PropTypes.any,
    title: PropTypes.string,
    headerStyle: PropTypes.object,
    toolbarStyle: PropTypes.object
}

export default ResponsiveDrawer
