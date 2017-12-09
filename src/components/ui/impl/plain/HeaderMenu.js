import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'
import {NavLink} from 'react-router-dom'

const HeaderMenu = ({items, isAuthenticated}) => (
    <div>
        {items.map((item,i) => {
            if( item.auth && isAuthenticated || !item.auth)
                return <NavLink className={'NavLink'} key={i} to={item.to}>{item.name}</NavLink>
        })}
    </div>
)


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