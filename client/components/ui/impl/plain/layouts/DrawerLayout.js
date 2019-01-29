import React from 'react'
import {
    MenuList,
    MenuListItem,
    Typography
} from '../'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'

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

    linkTo = item => {
        this.props.history.push(item.to)
    }

    render() {
        const {title, sidebar, children, isAuthenticated, menuItems} = this.props
        const {open} = this.state
        return (
            <div className="DrawerLayout">
                <div className="DrawerLayout__appFrame">
                    <div className={'DrawerLayout__appBar' + (open ? ' DrawerLayout__appBar--open' : '')}>
                        <div>
                            {open ? '' :
                                <button
                                    color="inherit"
                                    aria-label="open drawer"
                                    onClick={this.handleDrawerOpen}
                                    className="DrawerLayout__menuButton"
                                >
                                    open
                                </button>
                            }
                            <h1 className="DrawerLayout__menuTitle">
                                {title}
                            </h1>
                        </div>
                    </div>
                    <div className={'DrawerLayout__drawerPaper' + (open ? ' DrawerLayout__drawerPaper--open' : '')}>

                        <div className="DrawerLayout__sidebar">
                            <div className="DrawerLayout__sidebarHeader">
                                <button onClick={this.handleDrawerClose}>
                                    close
                                </button>
                            </div>
                            <hr />

                            {menuItems &&
                            <MenuList>

                                {menuItems.map((item, i) => {
                                    if (item.auth && isAuthenticated || !item.auth) {
                                        const isActive = false
                                        return <MenuListItem onClick={this.linkTo.bind(this, item)}
                                                             key={i}
                                                             button>
                                            {
                                                item.icon && <span>
                                                    {item.icon}
                                                </span>
                                            }
                                            <Typography variant="subtitle1"
                                                        component="h3"
                                                        className={(isActive ? classes.listItemActive : '')}>{item.name}</Typography>
                                        </MenuListItem>

                                    }
                                })}
                            </MenuList>
                            }
                            {sidebar}
                        </div>
                    </div>
                    <main className="DrawerLayout__content">
                        {children}
                    </main>
                </div>
            </div>
        );
    }
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
)(withRouter(DrawerLayout))
