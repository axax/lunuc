import React from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'

const {ADMIN_BASE_URL} = config
import LogoutContainer from 'client/containers/LogoutContainer'
import Async from 'client/components/Async'
import {
    CAPABILITY_ACCESS_ADMIN_PAGE
} from 'util/capabilities.mjs'
import {scrollByHash} from '../../../extensions/cms/util/urlUtil'
import {RouteHistory} from '../../util/route'
import Util from '../../util/index.mjs'

const BaseLayout = (props) => <Async {...props}
                                     asyncKey="BaseLayout"
                                     load={import(/* webpackChunkName: "admin" */ '../../components/layout/BaseLayout')}/>

const BlankLayout = (props) => <Async {...props}
                                     asyncKey="BlankLayout"
                                     load={import(/* webpackChunkName: "admin" */ '../../components/layout/BlankLayout')}/>

const LoginContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/LoginContainer')}/>
const SignUpContainer = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/SignUpContainer')}/>
const UserProfileContainer = (props) => <Async {...props}
                                               asyncKey="UserProfileContainer"
                                               load={import(/* webpackChunkName: "admin" */ '../../containers/UserProfileContainer')}/>
const SystemContainer = (props) => <Async {...props}
                                          asyncKey="SystemContainer"
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/SystemContainer')}/>
const BackupContainer = (props) => <Async {...props}
                                          asyncKey="BackupContainer"
                                          load={import(/* webpackChunkName: "admin" */ '../../containers/BackupContainer')}/>
const FilesContainer = (props) => <Async {...props}
                                         asyncKey="FilesContainer"
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/FilesContainer')}/>
const TypesContainer = (props) => <Async {...props}
                                         asyncKey="TypesContainer"
                                         load={import(/* webpackChunkName: "admin" */ '../../containers/TypesContainer')}/>
const HomeContainer = (props) => <Async {...props}
                                        asyncKey="HomeContainer"
                                        load={import(/* webpackChunkName: "admin" */ '../../containers/HomeContainer')}/>
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../components/layout/ErrorPage')}/>

const UnauthorizedPage = () => (
    <ErrorPage code="401" title="Unauthorized" background="#f4a742"/>
)

class Routes extends React.Component {

    adminBaseUrlPlain = ADMIN_BASE_URL.slice(1)

    routes = [
        {exact: true, private: true, path: ADMIN_BASE_URL + '/', component: HomeContainer, layout: BaseLayout},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/home/:name*', component: HomeContainer, layout: BaseLayout},
        {path: ADMIN_BASE_URL + '/login', component: LoginContainer, layout: BlankLayout},
        {path: ADMIN_BASE_URL + '/logout', component: LogoutContainer, layout: BlankLayout},
        {path: ADMIN_BASE_URL + '/signup', component: SignUpContainer, layout: BlankLayout},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/typesblank/:type*', component: TypesContainer,
            layout: BlankLayout, layoutProps: {style:{margin:'1rem'}}},
        {exact: true, private: true, path: ADMIN_BASE_URL + '/types/:type*', component: TypesContainer, layout: BaseLayout},
        {private: true, path: ADMIN_BASE_URL + '/profile', component: UserProfileContainer, layout: BaseLayout},
        {private: true, path: ADMIN_BASE_URL + '/system', component: SystemContainer, layout: BaseLayout},
        {private: true, path: ADMIN_BASE_URL + '/backup', component: BackupContainer, layout: BaseLayout},
        {private: true, path: ADMIN_BASE_URL + '/files', component: FilesContainer, layout: BaseLayout}
    ]

    constructor(props) {
        super(props)
        _app_.history = new RouteHistory()
        Hook.call('Routes', {routes: this.routes, container: this})
        this.routes.sort((a, b) => b.path.length - a.path.length)
        scrollByHash(location.href, {scrollStep:100000})
    }

    componentDidMount() {
        _app_.history.listen(()=>{
            this.forceUpdate()
        })
    }

    render() {

        const isAuthenticated = !!_app_.user
        const user = _app_.user || {}

        const capabilities = (user.role && user.role.capabilities) || []

        if(_app_.redirect404 === location.pathname){
            return <ErrorPage />
        }
        const refPath = location.pathname + '/'
        let hasUnauthorized = false

        for(let i = 0; i < this.routes.length;i++){
            const route = this.routes[i],
                path = route.path

            if (!isAuthenticated ||
                !path.startsWith(ADMIN_BASE_URL) ||
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
                        console.log('redirect to login page')
                        _app_.history.replace(config.ADMIN_BASE_URL + '/login?forward='+location.pathname)
                        this.forceUpdate()
                        return null
                    }

                    let comp
                    if(route.render){
                        comp = route.render({match, location: newLocation, history: _app_.history})
                    }
                    if(route.component) {
                        comp = <route.component match={match}
                                                location={newLocation}
                                                history={_app_.history}></route.component>
                    }

                    if(comp){
                        if(route.layout){
                            let Layout = route.layout === 'base' ? BaseLayout : route.layout
                            return <Layout {...route.layoutProps}>{comp}</Layout>
                        }
                        return comp
                    }
                }
            } else {
                hasUnauthorized = true
            }
        }
        if(hasUnauthorized) {
            return <UnauthorizedPage/>
        }
        return <ErrorPage />
    }
}

export default Routes
