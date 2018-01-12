import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'

import { default as Menu } from 'antd/lib/menu'


class HeaderMenu extends React.Component {
    constructor() {
        super();
        this.state = {
            selectedKeys: []
        }
    }
    componentWillReceiveProps() {
        this.setState({ selectedKeys: ['/'+this.props.location.pathname.split('/')[1]] });
    }

    componentDidMount() {

        this.setState({ selectedKeys: ['/'+this.props.location.pathname.split('/')[1]] });
    }

    linkTo(item) {
        this.props.history.push(item.key);
    }
    render() {

        const {isAuthenticated, items} = this.props


        return <Menu theme="dark" mode="horizontal" style={{lineHeight: '64px'}} defaultSelectedKeys={[items[0].to]}
                     selectedKeys={this.state.selectedKeys} onClick={this.linkTo.bind(this)}>
            {items.map((item) => {
                if( item.auth && isAuthenticated || !item.auth)
                    return <Menu.Item key={item.to}>{item.name}</Menu.Item>
            })}
        </Menu>
    }
}

HeaderMenu.propTypes = {
    items: PropTypes.array.isRequired,
    /* UserReducer */
    isAuthenticated: PropTypes.bool
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
)(withRouter(HeaderMenu))