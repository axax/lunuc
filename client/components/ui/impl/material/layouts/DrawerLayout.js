import React from 'react'
import PropTypes from 'prop-types'
import Drawer from '@mui/material/Drawer'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuIcon from '@mui/icons-material/Menu'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import styled from '@emotion/styled'

const DRAWER_WIDTH_DEFAULT = 540

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

const StyledAppBar = styled(AppBar, {
    shouldForwardProp: (prop) => prop !== 'fixed',
})(({ theme, fixed }) => ({
    position: 'absolute',
    maxWidth: '100%',
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(['width', 'margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    ...(fixed && {
        position: 'fixed'
    })
}))

const StyledMenuButton = styled(IconButton, {
    shouldForwardProp: (prop) => prop !== 'hidden',
})(({ hidden }) => ({
    marginLeft: 12,
    marginRight: 36,
    ...(hidden && {
        display: 'none',
    })
}))

const StyledDrawer = styled(Drawer, {
    shouldForwardProp: (prop) => prop !== 'fixed',
})(({ theme, open }) => ({
    maxWidth: '100%',
    height:'100vh',
    position: 'fixed',
    top: '0px',
    bottom: '0px',
    zIndex: theme.zIndex.drawer,
    '.MuiPaper-root':{
        position: 'relative',
        maxWidth: '100%',
        transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
        }),
        flex: '1 auto',
        ...(!open && {
            width: 0,
            overflowY: 'hidden',
            height: window.innerHeight, /* otherwise with width=0, in some brower, the height get enormuous */
            transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
            })
        })
    }
}))


const StyledDrawerHeader = styled('div')(({ theme }) => ({
    backgroundColor: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 8px',
    ...theme.mixins.toolbar
}))

const StyledDrawerDivider = styled('div')({
    position: 'absolute',
    width: '4px',
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
})


const StyledContent = styled('main')(({ theme, fixed, open }) => ({
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
    ...(fixed && !open && {
        transition: theme.transitions.create('margin', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
        })
    })
}))


class DrawerLayout extends React.Component {


    constructor(props) {
        super(props)
        this.state = {
            dragEntered: false,
            open: !!this.props.open,
            drawerWidth: this.props.drawerWidth || DRAWER_WIDTH_DEFAULT,
            drawerWidthOriginal: this.props.drawerWidth,
            openOriginal: this.props.open
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.open !== prevState.openOriginal || nextProps.drawerWidth !== prevState.drawerWidthOriginal) {
            return {
                open: !!nextProps.open,
                drawerWidth: nextProps.drawerWidth || DRAWER_WIDTH_DEFAULT,
                drawerWidthOriginal: nextProps.drawerWidth,
                openOriginal: nextProps.open
            }
        }
        return null
    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextProps !== this.props || this.state.open !== nextState.open || this.state.drawerWidth !== nextState.drawerWidth || this.state.dragEntered !== nextState.dragEntered
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
        const {onDrawerOpenClose} = this.props
        if (onDrawerOpenClose) {
            onDrawerOpenClose(true)
        }
    }

    mouseDividerPos = false

    handleDrawerClose = () => {
        this.setState({open: false})
        const {onDrawerOpenClose} = this.props
        if (onDrawerOpenClose) {
            onDrawerOpenClose(false)
        }
    }

    dividerMouseDown = (e) => {
        this.mouseDividerPos = e.pageX
    }

    dividerMouseMove = (e) => {
        if (this.mouseDividerPos !== false) {
            const drawerWidth = parseFloat(this.props.drawerWidth || DRAWER_WIDTH_DEFAULT)

            const newDrawerWidth = drawerWidth + (e.pageX - this.mouseDividerPos)
            if(newDrawerWidth<150) {
                this.handleDrawerClose()
            }else{
                this.setState({drawerWidth: newDrawerWidth})
            }
        }
    }

    dividerMouseUp = (e) => {
        if(this.state.dragEntered) {
            this.setState({dragEntered: false})
        }
        const {onDrawerWidthChange} = this.props
        if (onDrawerWidthChange && this.props.drawerWidth !== this.state.drawerWidth) {
            onDrawerWidthChange(this.state.drawerWidth)
        }
        this.mouseDividerPos = false
    }

    // When the popover is open and users click anywhere on the page,
    // the popover should close
    componentDidMount() {
        document.addEventListener('mousemove', this.dividerMouseMove)
        document.addEventListener('mouseup', this.dividerMouseUp)
    }

    componentWillUnmount() {
        document.removeEventListener('mousemove', this.dividerMouseMove)
        document.removeEventListener('mouseup', this.dividerMouseUp)
    }


    render() {
        const {title, sidebar, toolbarLeft, toolbarRight, children, fixedLayout} = this.props
        const {open, drawerWidth, dragEntered} = this.state
        const contentFixed = {}
        if (open) {
            contentFixed.marginLeft = drawerWidth + 'px'
            contentFixed.width = 'calc(100% - ' + drawerWidth + 'px)'
        }
        const style = {}
        if( open){
            style.width= `calc(100% - ${drawerWidth}px)`
        }
        if(dragEntered){
            style.pointerEvents ='none'
        }
        return (
            <StyledDrawerRoot>
                <StyledAppFrame>
                    <StyledAppBar
                        onDragEnter={(e)=>{
                            this.setState({dragEntered:true})
                        }}
                        fixed={fixedLayout}
                        style={style}
                        id="drawerLayoutHeader">
                        <Toolbar>
                            <StyledMenuButton
                                color="inherit"
                                aria-label="open drawer"
                                onClick={this.handleDrawerOpen}
                                hidden={open}>
                                <MenuIcon/>
                            </StyledMenuButton>
                            {toolbarLeft}
                            <Typography variant="h6" color="inherit" noWrap style={{flex: 1}}>
                                {title}
                            </Typography>
                            {toolbarRight}
                        </Toolbar>

                    </StyledAppBar>
                    <StyledDrawer
                        variant="permanent"
                        open={open}
                        style={{width: open ? drawerWidth + 'px' : 0}}>
                        <StyledDrawerHeader>
                            <IconButton onClick={this.handleDrawerClose}>
                                <ChevronLeftIcon/>
                            </IconButton>
                        </StyledDrawerHeader>
                        <Divider/>
                        {open && sidebar}
                        <StyledDrawerDivider onMouseDown={this.dividerMouseDown}/>
                    </StyledDrawer>
                    <StyledContent data-layout-content="true" style={contentFixed} fixed={fixedLayout} open={open}>
                        {children}
                    </StyledContent>
                </StyledAppFrame>
            </StyledDrawerRoot>
        )
    }
}

DrawerLayout.propTypes = {
    theme: PropTypes.object.isRequired,
    fixedLayout: PropTypes.bool,
    open: PropTypes.bool,
    onDrawerWidthChange: PropTypes.func,
    onDrawerOpenClose: PropTypes.func,
    drawerWidth: PropTypes.number
}


export default DrawerLayout
