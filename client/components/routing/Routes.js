import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import Hook from 'util/hook'
import config from 'gen/config-client'

const {ADMIN_BASE_URL} = config
import LogoutContainer from 'client/containers/LogoutContainer'
import Async from 'client/components/Async'
import {
    CAPABILITY_ACCESS_ADMIN_PAGE
} from 'util/capabilities'
import {scrollByHash} from '../../../extensions/cms/util/urlUtil'
import {RouteHistory, Link} from '../../util/route'
import Util from '../../util'

const LoginContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/LoginContainer')}/>
const SignUpContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/SignUpContainer')}/>
const UserProfileContainer = (props) => <Async {...props}
                                               load={import(/* webpackChunkName: "admin" */ '../../containers/UserProfileContainer')}/>
const SystemContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/SystemContainer')}/>
const BackupContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/BackupContainer')}/>
const FilesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/FilesContainer')}/>
const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/TypesContainer')}/>
const HomeContainer = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "admin" */ '../../containers/HomeContainer')}/>
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../components/layout/ErrorPage')}/>

const UnauthorizedPage = () => (
    <ErrorPage code="401" title="Unauthorized" background="#f4a742"/>
)

class Routes extends React.Component {

    adminBaseUrlPlain = ADMIN_BASE_URL.slice(1)

    routes = [
        {exact: true, private: true, path: ADMIN_BASE_URL + '/', component: HomeContainer},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/home/:name*', component: HomeContainer},
        {path: ADMIN_BASE_URL + '/login', component: LoginContainer},
        {path: ADMIN_BASE_URL + '/logout', component: LogoutContainer},
        {path: ADMIN_BASE_URL + '/signup', component: SignUpContainer},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/types/:type*', component: TypesContainer},
        {private: true, path: ADMIN_BASE_URL + '/profile', component: UserProfileContainer},
        {private: true, path: ADMIN_BASE_URL + '/system', component: SystemContainer},
        {private: true, path: ADMIN_BASE_URL + '/backup', component: BackupContainer},
        {private: true, path: ADMIN_BASE_URL + '/files', component: FilesContainer}
    ]

    constructor(props) {
        super(props)
        _app_.history = new RouteHistory()
        Hook.call('Routes', {routes: this.routes, container: this})
        this.routes.sort((a, b) => b.path.length - a.path.length)
        scrollByHash(location.href, {})
    }

    componentDidMount() {
        _app_.history.listen(()=>{
            this.forceUpdate()
        })
    }

    render() {
        const {user: {isAuthenticated, userData}} = this.props
        const capabilities = (userData && userData.role && userData.role.capabilities) || []

        if(_app_.redirect404 === location.pathname){
            return <ErrorPage />
        }
        const refPath = location.pathname + '/'
        for(let i = 0; i < this.routes.length;i++){
            const route = this.routes[i],
                path = route.path

            if (!isAuthenticated || !path.startsWith(ADMIN_BASE_URL) ||
                path.startsWith(ADMIN_BASE_URL + '/login') ||
                path.startsWith(ADMIN_BASE_URL + '/profile') ||
                path.startsWith(ADMIN_BASE_URL + '/types') ||
                path.startsWith(ADMIN_BASE_URL + '/logout') ||
                capabilities.indexOf(CAPABILITY_ACCESS_ADMIN_PAGE) >= 0) {

                const colonPos = path.indexOf(':')

                let startPath=_app_.contextPath, patternPath
                if (colonPos >= 0) {
                    startPath += path.substring(0, colonPos)
                    patternPath = path.substring(colonPos)
                } else {
                    startPath += path
                }


                if( refPath.indexOf(startPath)===0 ){

                    if(!patternPath && route.exact && Util.removeTrailingSlash(location.pathname)!==Util.removeTrailingSlash(startPath)){
                        continue
                    }

                    const newLocation = Object.assign({},location)
                    const match = {params:{}}
                    if(patternPath){
                        // dirty implementation.... works only for one parameter
                        const refPatternPath = location.pathname.substring(startPath.length)
                        patternPath.split('/').forEach(p=>{
                            p = p.substring(1)
                            if(p.endsWith('*')){
                                p = p.substring(0,p.length-1)
                                match.params[p] = refPatternPath
                            }
                        })
                    }

                    if( route.private && !isAuthenticated){
                        _app_.history.replace(config.ADMIN_BASE_URL + '/login?forward='+location.pathname)
                        return null
                    }

                    if(route.render){
                        return route.render({match, location: newLocation, history: _app_.history})
                    }

                    return <route.component match={match} location={newLocation} history={_app_.history}></route.component>
                }



            } else {
                return <UnauthorizedPage />
            }


        }

        return <ErrorPage />
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
