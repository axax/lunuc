import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import {Link} from 'react-router-dom'
import * as UserActions from 'client/actions/UserAction'
import * as ErrorHandlerAction from 'client/actions/ErrorHandlerAction'
import {Card, SimpleButton, TextField, Row, Col, Typography} from 'ui/admin'
import config from 'gen/config-client'
import BlankLayout from 'client/components/layout/BlankLayout'
import Util from 'client/util'
import DomUtil from '../util/dom'
import {client} from 'client/middleware/graphql'
import {_t} from 'util/i18n'

class LoginContainer extends React.Component {
    state = {
        redirectToReferrer: false,
        loading: false,
        error: null,
        username: '',
        password: '',
        domain:''
    }

    constructor(props) {
        super(props)
        DomUtil.createAndAddTag('meta', 'head', {
            name: 'robots',
            content: 'noindex, nofollow',
            id: 'metaTagNoIndex'
        })
    }

    componentWillUnmount() {
        DomUtil.removeElements('#metaTagNoIndex', null, document.head)
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name

        this.setState({
            [target.name]: value
        })
    }


    login = (e) => {
        e.preventDefault()

        this.setState({loading: true, error: null})
        const {userActions, errorHandlerAction} = this.props

        client.query({
            fetchPolicy: 'no-cache',
            query: 'query login($username:String!,$password:String!,$domain:String){login(username:$username,password:$password,domain:$domain){token error user{username email _id role{_id capabilities}}}}',
            variables: {
                username: this.state.username,
                password: this.state.password,
                domain: this.state.domain
            }
        }).then( response => {
            this.setState({loading: false})
            if (response.data && response.data.login) {

                if (!response.data.login.error) {
                    // clear cache completely
                    client.resetStore()
                    if(response.data.login.token) {
                        localStorage.setItem('token', response.data.login.token)
                    }

                    userActions.setUser(response.data.login.user, true)
                    errorHandlerAction.clearErrors()

                    //this.setState({redirectToReferrer: true})
                    // make sure translations are loaded
                    window.location = this.getFromUrl().pathname

                } else {
                    this.setState({error: response.data.login.error})
                }
            }
        }).catch((response)=>{
            this.setState({loading: false, error: response.error.message})

        })
    }

    getFromUrl(){
        const {location} = this.props
        let from

        if (location && location.state) {
            from = location.state.from
        }
        if (!from) {
            const params = Util.extractQueryParams()
            if (params.forward) {
                from = {pathname: params.forward}
            }
        }
        if (!from) {
            from = {pathname: config.ADMIN_BASE_URL}
        }

        return from
    }

    render() {
        const {signupLink, showSignupLink} = this.props
        const from = this.getFromUrl()

        const {redirectToReferrer, loading, username, password, domain, error} = this.state

        if (redirectToReferrer) {
            return <Redirect to={from} push={true}/>
        }

        return (
            <BlankLayout style={{marginTop: '5rem'}}>
                <Row>
                    <Col xs={1} sm={2} md={4}></Col>
                    <Col xs={10} sm={8} md={4}>
                        <Card>
                            <form noValidate autoComplete="off">
                                <Typography variant="h3" gutterBottom>{_t('Login.title')}</Typography>

                                <Typography gutterBottom>{_t('Login.subtitle', from)}</Typography>


                                <TextField label={_t('Login.username')}
                                           error={!!error}
                                           disabled={!!loading}
                                           autoComplete="current-password"
                                           fullWidth
                                           autoFocus
                                           value={username}
                                           onChange={this.handleInputChange}
                                           type="text"
                                           name="username" required/>


                                <TextField label={_t('Login.password')}
                                           error={!!error}
                                           helperText={error}
                                           disabled={!!loading}
                                           fullWidth
                                           autoComplete="current-password"
                                           value={password}
                                           onChange={this.handleInputChange}
                                           onKeyPress={(ev) => {
                                               if (ev.key === 'Enter') {
                                                   this.login(ev)
                                               }
                                           }}
                                           type="password"
                                           name="password" required/>


                                <TextField label={_t('Login.domain')}
                                           error={!!error}
                                           disabled={!!loading}
                                           fullWidth
                                           autoFocus
                                           value={domain}
                                           onChange={this.handleInputChange}
                                           type="text"
                                           name="domain"/>

                                <div style={{textAlign: 'right'}}>
                                    <SimpleButton variant="contained" color="primary"
                                                  showProgress={loading}
                                                  onClick={this.login.bind(this)}>Login</SimpleButton>
                                </div>
                                {showSignupLink && <Typography>Don&apos;t have an account? <Link to={signupLink || config.ADMIN_BASE_URL + '/signup'}>Sign
                                    up</Link></Typography>}
                            </form>
                        </Card>
                    </Col>
                    <Col xs={1} sm={2} md={4}></Col>
                </Row>

            </BlankLayout>
        )
    }
}


LoginContainer.propTypes = {
    location: PropTypes.object,
    signupLink: PropTypes.string,
    /* UserReducer */
    userActions: PropTypes.object.isRequired,
    errorHandlerAction: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = () => {
    return {}
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    userActions: bindActionCreators(UserActions, dispatch),
    errorHandlerAction: bindActionCreators(ErrorHandlerAction, dispatch)
})

/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(LoginContainer)
