import React from 'react'
import PropTypes from 'prop-types'
import classNames from 'classnames'


const styles ={
    root: {},
    appFrame: {
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative'
    },
    appBar: {
        position: 'absolute',
        height: '50px',
        width: '100%',
        display: 'flex',
        zIndex: 1100,
        boxSizing: 'border-box',
        flexShrink: 0,
        flexDirection: 'column',
        background: '#4286f4'
    },
    appBarShift: {
        marginLeft: '200px'
    },
    menuButton: {float: 'left'},
    menuTitle: {float: 'left', margin:0},
    hide:{},
    drawerPaper: {
        flex: '0 0 auto',
        width: '200px',
        background: '#4286f4',
        zIndex:10,
    },
    drawerPaperClose: {
        width: '0px',
        display: 'none'
    },
    drawerInner: {margin:'80px'},
    drawerHeader: {},
    content: {
        height: 'calc(100% - 64px)',
        marginTop: '64px',
        width: '100%',
        padding: '24px',
        flexGrow: 1
    }
}

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
        const { title, children } = this.props;
        const { open } = this.state;

        return (
            <div style={styles.root}>
                <div style={styles.appFrame}>
                    <div style={Object.assign({},styles.appBar,(open?styles.appBarShift:null))}>
                        <div>
                            {open ? '' :
                                <button
                                    color="contrast"
                                    aria-label="open drawer"
                                    onClick={this.handleDrawerOpen}
                                    style={styles.menuButton}
                                >
                                    open
                                </button>
                            }
                            <h1 style={styles.menuTitle}>
                                {title}
                            </h1>
                        </div>
                    </div>
                    <div
                        style={(open?styles.drawerPaper:styles.drawerPaperClose)}
                        open={open}
                    >

                        <div style={styles.drawerInner}>
                            <div style={styles.drawerHeader}>
                                <button onClick={this.handleDrawerClose}>
                                    close
                                </button>
                            </div>
                            <hr />
                        </div>
                    </div>
                    <main style={styles.content}>
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