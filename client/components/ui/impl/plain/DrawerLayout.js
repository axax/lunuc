import React from 'react'
import PropTypes from 'prop-types'



class DrawerLayout extends React.Component {
    state = {
        open: false,
    }

    handleDrawerOpen = () => {
        this.setState({ open: true });
    };

    handleDrawerClose = () => {
        this.setState({ open: false });
    };

    render() {
        const { title, sidebar, children } = this.props;
        const { open } = this.state;

        return (
            <div className="DrawerLayout">
                <div className="DrawerLayout__appFrame">
                    <div className={'DrawerLayout__appBar' +(open?' DrawerLayout__appBar--open':'')}>
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
                    <div className={'DrawerLayout__drawerPaper' +(open?' DrawerLayout__drawerPaper--open':'')}>

                        <div className="DrawerLayout__sidebar">
                            <div className="DrawerLayout__sidebarHeader">
                                <button onClick={this.handleDrawerClose}>
                                    close
                                </button>
                            </div>
                            <hr />
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

DrawerLayout.propTypes = {
}

export default DrawerLayout