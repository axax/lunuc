import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Router, Route} from 'react-router-dom'
import LoginContainer from 'client/containers/LoginContainer'
import SignUpContainer from 'client/containers/SignUpContainer'
import UserProfileContainer from 'client/containers/UserProfileContainer'
import CmsViewContainer from 'client/containers/CmsViewContainer'
import SystemContainer from 'client/containers/SystemContainer'
import TypesContainer from 'client/containers/TypesContainer'
import HomeContainer from 'client/containers/HomeContainer'
import PrivateRoute from './PrivateRoute'
import Hook from 'util/hook'
import config from 'gen/config'
import {createBrowserHistory} from 'history'
const {ADMIN_BASE_URL} = config

class Routes extends React.Component {

    adminBaseUrlPlain = ADMIN_BASE_URL.slice(1)
    contextLang = window.location.pathname.split('/')[1].toLowerCase()
    history = createBrowserHistory()
    pathPrefix = ''

    routes = [
        {exact: true, path: ADMIN_BASE_URL + '/', component: HomeContainer},
        {
            private: true,
            exact: true,
            path: ADMIN_BASE_URL + '/cms/:page*',
            component: (p) => <TypesContainer fixType="CmsPage" {...p} />
        },
        {path: ADMIN_BASE_URL + '/login', component: LoginContainer},
        {path: ADMIN_BASE_URL + '/signup', component: SignUpContainer},
        {private: true, path: ADMIN_BASE_URL + '/profile', component: UserProfileContainer},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/types/:type*', component: TypesContainer},
        {private: true, path: ADMIN_BASE_URL + '/system', component: SystemContainer},
        {
            // match everything but paths that start with ADMIN_BASE_URL
            exact: false, path: '/:slug*', render: ({match}) => {
            if (match.params.slug === undefined || (match.params.slug && match.params.slug.split('/')[0] !== this.adminBaseUrlPlain)) {
                return <CmsViewContainer match={match} slug={match.params.slug || ''}/>;
            }
            return null
        }
        }
    ]

    constructor(props) {
        super(props)
        Hook.call('Routes', {routes: this.routes})
        if (this.contextLang === window._app_.lang) {
            this.pathPrefix = '/' + this.contextLang
        }
        // override push and replace methode to prepend language code if needed
        this.history._replace = this.history.replace
        this.history._push = this.history.push
        this.history.push = (path, state) => {
            this.history._push(this.pathPrefix + path, state)
        }
        this.history.replace = (o, state) => {
            o.pathname = this.pathPrefix + o.pathname
            this.history._replace(o, state)
        }
    }

    render() {
        const {user: {isAuthenticated, userData}} = this.props
        const capabilities = (userData && userData.role && userData.role.capabilities) || []
        return <Router history={this.history}>
            <div id="router">
                {this.routes.map((o, i) => {

                    if (!isAuthenticated || !o.path.startsWith(ADMIN_BASE_URL) || capabilities.indexOf('access_admin_page') >= 0) {
                        if (o.private) {
                            return <PrivateRoute key={i} path={this.pathPrefix + o.path}
                                                 isAuthenticated={isAuthenticated}
                                                 component={o.component}/>
                        } else {
                            return <Route key={i} path={this.pathPrefix + o.path} exact={o.exact}
                                          component={o.component}
                                          render={o.render}/>
                        }
                    }
                })}
            </div>
        </Router>
    }
}


Routes.propTypes = {
    user: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    return {
        user: store.user
    }
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(Routes)
