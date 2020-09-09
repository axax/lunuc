import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Router, Route, Switch} from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import Hook from 'util/hook'
import config from 'gen/config'
import {createBrowserHistory} from 'history'
const {ADMIN_BASE_URL} = config
import LogoutContainer from 'client/containers/LogoutContainer'
import Async from 'client/components/Async'
import {
    CAPABILITY_ACCESS_ADMIN_PAGE, CAPABILITY_MANAGE_TYPES
} from 'util/capabilities'

const LoginContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/LoginContainer')}/>
const SignUpContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/SignUpContainer')}/>
const UserProfileContainer = (props) => <Async {...props}
                                               load={import(/* webpackChunkName: "admin" */ '../../containers/UserProfileContainer')}/>
const SystemContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/SystemContainer')}/>
const DbDumpContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/DbDumpContainer')}/>
const FilesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/FilesContainer')}/>
const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/TypesContainer')}/>
const HomeContainer = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "admin" */ '../../containers/HomeContainer')}/>
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../components/layout/ErrorPage')}/>

const UnauthorizedPage = (props) => (
    <ErrorPage code="401" title="Unauthorized" background="#f4a742"/>
)

class Routes extends React.Component {

    adminBaseUrlPlain = ADMIN_BASE_URL.slice(1)
    history = createBrowserHistory()

    routes = [
        {exact: true, private: true, path: ADMIN_BASE_URL + '/', component: HomeContainer},
        {path: ADMIN_BASE_URL + '/login', component: LoginContainer},
        {path: ADMIN_BASE_URL + '/logout', component: LogoutContainer},
        {path: ADMIN_BASE_URL + '/signup', component: SignUpContainer},
        {private: true, path: ADMIN_BASE_URL + '/profile', component: UserProfileContainer},
        {private: true, path: ADMIN_BASE_URL + '/system', component: SystemContainer},
        {private: true, path: ADMIN_BASE_URL + '/backup', component: DbDumpContainer},
        {private: true, path: ADMIN_BASE_URL + '/files', component: FilesContainer}
    ]

    constructor(props) {
        super(props)

        const {user: {userData}} = this.props
        const capabilities = (userData && userData.role && userData.role.capabilities) || []

        if(capabilities.indexOf(CAPABILITY_MANAGE_TYPES) >= 0){
            this.routes.push({exact: true, private: true, path: ADMIN_BASE_URL + '/types/:type*', component: TypesContainer})
        }

        Hook.call('Routes', {routes: this.routes, container: this})

        // override push and replace methode to prepend language code if needed
        this.history._replace = this.history.replace
        this.history._push = this.history.push
        this.history.push = (path, state) => {
            let newPath
            if( path.constructor === Object)
                path = path.pathname
            if (path.split('?')[0].split('#')[0]!==_app_.contextPath && path.indexOf(_app_.contextPath + '/') !== 0) {
                newPath = _app_.contextPath + path
            } else {
                newPath = path
            }
            this.history._last = this.history.location.pathname
            this.history._push(newPath, state)
        }
        this.history.replace = (o, state) => {
            if (o.pathname !== _app_.contextPath && o.pathname.indexOf(_app_.contextPath + '/') < 0) {
                o.pathname = _app_.contextPath + o.pathname
            }
            this.history._replace(o, state)
        }
    }

    render() {
        const {user: {isAuthenticated, userData}} = this.props
        const capabilities = (userData && userData.role && userData.role.capabilities) || []
        return <Router history={this.history}>
            <Switch>
                {this.routes.map((o, i) => {
                    if (!isAuthenticated || !o.path.startsWith(ADMIN_BASE_URL) || o.path.startsWith(ADMIN_BASE_URL + '/login') || o.path.startsWith(ADMIN_BASE_URL + '/types') || o.path.startsWith(ADMIN_BASE_URL + '/logout') || capabilities.indexOf(CAPABILITY_ACCESS_ADMIN_PAGE) >= 0) {
                        if (o.private) {
                            return <PrivateRoute key={i} path={_app_.contextPath + o.path}
                                                 isAuthenticated={isAuthenticated}
                                                 exact={o.exact}
                                                 component={o.component}/>
                        } else {
                            return <Route key={i} path={_app_.contextPath + o.path} exact={o.exact}
                                          component={o.component}
                                          render={o.render}/>
                        }
                    } else {
                        return <Route key={i} path={_app_.contextPath + o.path} exact={o.exact}
                                      component={UnauthorizedPage}/>
                    }
                })}
                <Route component={ErrorPage}/>
            </Switch>
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
