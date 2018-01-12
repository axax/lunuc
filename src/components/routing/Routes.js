import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {BrowserRouter as Router, Route} from 'react-router-dom'
import LoginContainer from '../../containers/LoginContainer'
import SignUpContainer from '../../containers/SignUpContainer'
import UserProfileContainer from '../../containers/UserProfileContainer'
import SearchWhileSpeechContainer from '../../containers/SearchWhileSpeechContainer'
import LiveSpeechTranslaterContainer from '../../containers/LiveSpeechTranslaterContainer'
import WordContainer from '../../containers/WordContainer'
import PostContainer from '../../containers/PostContainer'
import CmsViewContainer from '../../containers/CmsViewContainer'
import CmsContainer from '../../containers/CmsContainer'
import Home from '../Home'
import PrivateRoute from './PrivateRoute'
import Hook from '../../../util/hook'

class Routes extends React.Component {

    routes = [
        {exact: true, path: '/', component: Home},
        {exact: true, path: '/search', component: SearchWhileSpeechContainer},
        {exact: true, path: '/translate', component: LiveSpeechTranslaterContainer},
        {exact: true, path: '/word/:page*', component: WordContainer},
        {exact: true, path: '/post/:id*', component: PostContainer},
        {exact: true, path: '/cms/view/:slug', component: CmsViewContainer},
        {exact: true, path: '/cms', component: CmsContainer},
        {exact: true, path: '/cms/:page', component: CmsContainer},
        {path: '/login', component: LoginContainer},
        {path: '/signup', component: SignUpContainer},
        {private: true, path: '/profile', component: UserProfileContainer},
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
                        return <PrivateRoute key={i} path={o.path} isAuthenticated={isAuthenticated} component={o.component}/>
                    } else {
                        return <Route key={i} path={o.path} exact={o.exact} component={o.component}/>
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
