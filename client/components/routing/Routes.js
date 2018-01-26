import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {BrowserRouter as Router, Route} from 'react-router-dom'
import LoginContainer from 'client/containers/LoginContainer'
import SignUpContainer from 'client/containers/SignUpContainer'
import UserProfileContainer from 'client/containers/UserProfileContainer'
import CmsViewContainer from 'client/containers/CmsViewContainer'
import CmsContainer from 'client/containers/CmsContainer'
import SystemContainer from 'client/containers/SystemContainer'
import TypesContainer from 'client/containers/TypesContainer'
import HomeContainer from 'client/containers/HomeContainer'
import PrivateRoute from './PrivateRoute'
import Hook from 'util/hook'
import {ADMIN_BASE_URL} from 'gen/config'

class Routes extends React.Component {

    adminBaseUrlPlain = ADMIN_BASE_URL.slice(1)

    routes = [
        {exact: true, path: ADMIN_BASE_URL + '/', component: HomeContainer},
        {private: true, exact: true, path: ADMIN_BASE_URL + '/cms/:page*', component: CmsContainer},
        {path: ADMIN_BASE_URL + '/login', component: LoginContainer},
        {path: ADMIN_BASE_URL + '/signup', component: SignUpContainer},
        {private: true, path: ADMIN_BASE_URL + '/profile', component: UserProfileContainer},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/types/:type*', component: TypesContainer},
        {private: true, path: ADMIN_BASE_URL + '/system', component: SystemContainer},
        {
            // match everything but paths that start with ADMIN_BASE_URL
            exact: false, path: '/:slug*', render: ({match}) => {
            if (match.url === '/' || (match.params.slug && match.params.slug.split('/')[0] !== this.adminBaseUrlPlain)) {
                return <CmsViewContainer slug={match.params.slug || ''}/>;
            }
            return null
        }
        }
    ]

    constructor(props) {
        super(props)
        Hook.call('Routes', {routes: this.routes})
    }

    render() {

        const {isAuthenticated} = this.props

        return <Router>
            <div id="router">
                {this.routes.map((o, i) => {
                    if (o.private) {
                        return <PrivateRoute key={i} path={o.path} isAuthenticated={isAuthenticated}
                                             component={o.component}/>
                    } else {
                        return <Route key={i} path={o.path} exact={o.exact} component={o.component} render={o.render}/>
                    }
                })}
            </div>
        </Router>
    }
}


Routes.propTypes = {
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
)(Routes)
