import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Router, Route} from 'react-router-dom'
import PrivateRoute from './PrivateRoute'
import Hook from 'util/hook'
import config from 'gen/config'
import {createBrowserHistory} from 'history'
const {ADMIN_BASE_URL} = config
import CmsViewContainer from 'client/containers/CmsViewContainer'
import LogoutContainer from 'client/containers/LogoutContainer'

import Async from 'client/components/Async'

const LoginContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/LoginContainer')} />
const SignUpContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/SignUpContainer')} />
const UserProfileContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/UserProfileContainer')} />
const SystemContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/SystemContainer')} />
const DbDumpContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/DbDumpContainer')} />
const FilesContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/FilesContainer')} />
const TypesContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/TypesContainer')} />
const HomeContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../containers/HomeContainer')} />
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "misc" */ '../../components/layout/ErrorPage')}/>

class Routes extends React.Component {

    adminBaseUrlPlain = ADMIN_BASE_URL.slice(1)
    contextLang = window.location.pathname.split('/')[1].toLowerCase()
    history = createBrowserHistory()
    pathPrefix = ''

    routes = [
        {exact: true, private: true, path: ADMIN_BASE_URL + '/', component: HomeContainer},
        {
            private: true,
            exact: true,
            path: ADMIN_BASE_URL + '/cms/:page*',
            component: (p) => <TypesContainer baseUrl={ADMIN_BASE_URL+"/cms/"} fixType="CmsPage" {...p} />
        },
        {path: ADMIN_BASE_URL + '/login', component: LoginContainer},
        {path: ADMIN_BASE_URL + '/logout', component: LogoutContainer},
        {path: ADMIN_BASE_URL + '/signup', component: SignUpContainer},
        {private: true, path: ADMIN_BASE_URL + '/profile', component: UserProfileContainer},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/types/:type*', component: TypesContainer},
        {private: true, path: ADMIN_BASE_URL + '/system', component: SystemContainer},
        {private: true, path: ADMIN_BASE_URL + '/backup', component: DbDumpContainer},
        {private: true, path: ADMIN_BASE_URL + '/files', component: FilesContainer},
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
            let newPath
            if( path.indexOf(this.pathPrefix + '/') < 0 ){
                newPath = this.pathPrefix + path
            }else{
                newPath = path
            }
            this.history._push(newPath, state)
        }
        this.history.replace = (o, state) => {
            if (o.pathname !== this.pathPrefix && o.pathname.indexOf(this.pathPrefix + '/') < 0) {
                o.pathname = this.pathPrefix + o.pathname
            }
            this.history._replace(o, state)
        }
    }

    render() {
        const {user: {isAuthenticated, userData}} = this.props
        const capabilities = (userData && userData.role && userData.role.capabilities) || []
        return <Router history={this.history}>
            <div id="router">
                {this.routes.map((o, i) => {
                    if (!isAuthenticated || !o.path.startsWith(ADMIN_BASE_URL) || o.path.startsWith(ADMIN_BASE_URL+'/login') || o.path.startsWith(ADMIN_BASE_URL+'/logout') || capabilities.indexOf('access_admin_page') >= 0) {
                        if (o.private) {
                            return <PrivateRoute key={i} path={this.pathPrefix + o.path}
                                                 isAuthenticated={isAuthenticated}
                                                 exact={o.exact}
                                                 component={o.component}/>
                        } else {
                            return <Route key={i} path={this.pathPrefix + o.path} exact={o.exact}
                                          component={o.component}
                                          render={o.render}/>
                        }
                    }else{
                        return <Route key={i} path={this.pathPrefix + o.path} exact={o.exact}
                                      component={ErrorPage}/>
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
