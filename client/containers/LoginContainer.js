import React from 'react'
import PropTypes from 'prop-types'
import {Link, Redirect} from '../util/route'
import {Card, SimpleButton, TextField, Row, Col, Typography} from 'ui/admin'
import config from 'gen/config-client'
import Util from 'client/util/index.mjs'
import DomUtil from '../util/dom.mjs'
import {client} from 'client/middleware/graphql'
import {_t} from 'util/i18n.mjs'

class LoginContainer extends React.Component {


    constructor(props) {
        super(props)
        DomUtil.createAndAddTag('meta', 'head', {
            name: 'robots',
            content: 'noindex, nofollow',
            id: 'metaTagNoIndex'
        })

        const {domain, username} = Util.extractQueryParams(window.location.search.substring(1))

        this.state = {
            redirectToReferrer: false,
            loading: false,
            error: null,
            username: username || '',
            password: '',
            newPassword:'',
            resetToken:'',
            domain: _app_.login ? _app_.login.defaultDomain : domain || ''
        }
    }

    componentWillUnmount() {
        DomUtil.removeElements('#metaTagNoIndex', null, document.head)
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value

        this.setState({
            [target.name]: value
        })
    }


    changePassword = (e) =>{
        e.preventDefault()

        this.setState({loading: true, error: null})


        client.query({
            fetchPolicy: 'no-cache',
            query: 'query newPassword($token:String!, $password:String!, $passwordConfirm:String){newPassword(token:$token,password:$password,passwordConfirm:$passwordConfirm){status}}',
            variables: {
                token: this.state.resetToken,
                password: this.state.newPassword,
                passwordConfirm: this.state.newPassword
            }
        }).then(response => {
            this.setState({loading: false})
            if (response.data && response.data.newPassword) {

                if (!response.data.newPassword.error) {

                    _app_.dispatcher.setUser(Object.assign({},this.state.currentUser,{
                        requestNewPassword: false
                    }))

                    // make sure translations are loaded
                    window.location = this.getFromUrl()

                } else {
                    this.setState({error: response.data.newPassword.error})
                }
            }
        }).catch((response) => {
            this.setState({loading: false, error: response.error.message})
        })
    }

    login = (e) => {
        e.preventDefault()

        this.setState({loading: true, error: null})

        client.query({
            fetchPolicy: 'no-cache',
            query: 'query login($username:String!,$password:String!,$domain:String){login(username:$username,password:$password,domain:$domain){token resetToken error user{username requestNewPassword email _id role{_id capabilities}}}}',
            variables: {
                username: this.state.username,
                password: this.state.password,
                domain: this.state.domain
            }
        }).then(response => {
            this.setState({loading: false})
            if (response.data && response.data.login) {

                if (!response.data.login.error) {
                    // clear cache completely
                    client.resetStore()
                    if (response.data.login.token) {
                        localStorage.setItem('token', response.data.login.token)
                    }

                    _app_.dispatcher.setUser(response.data.login.user)

                    if(response.data.login.user.requestNewPassword){
                        this.setState({resetToken: response.data.login.resetToken, currentUser: response.data.login.user})
                    } else {

                        // make sure translations are loaded
                        window.location = this.getFromUrl()
                    }

                } else {
                    this.setState({error: response.data.login.error})
                }
            }
        }).catch((response) => {
            this.setState({loading: false, error: response.error.message})
        })
    }

    getFromUrl() {
        const params = Util.extractQueryParams()
        if (params.forward) {
            return params.forward
        }
        return config.ADMIN_BASE_URL
    }

    render() {
        const {signupLink, showSignupLink} = this.props
        const from = this.getFromUrl()

        const {resetToken, redirectToReferrer, loading, username, password, newPassword, domain, error} = this.state

        if (redirectToReferrer) {
            return <Redirect to={from} push={true}/>
        }

        return <Row style={{marginTop: '5rem'}}>
            <Col xs={1} sm={2} md={4}></Col>
            <Col xs={10} sm={8} md={4}>
                <Card>
                    {resetToken ?
                        <form noValidate autoComplete="off" action="/graphql/login" method="post">
                            <Typography variant="h3" gutterBottom>{_t('Login.changePasswordTitle')}</Typography>

                            <Typography gutterBottom>{_t('Login.changePasswordSubtitle')}</Typography>

                            <input value={from}
                                   type="hidden"
                                   name="forward"/>

                            <TextField label={_t('Login.newPassword')}
                                       autoFocus
                                       inputRef={(input) => {
                                           if(input != null) {
                                               input.focus()
                                           }
                                       }}
                                       error={!!error}
                                       helperText={error}
                                       disabled={!!loading}
                                       fullWidth
                                       value={newPassword}
                                       onChange={this.handleInputChange}
                                       onKeyPress={(ev) => {
                                           if (ev.key === 'Enter') {
                                               this.changePassword(ev)
                                           }
                                       }}
                                       type="password"
                                       name="newPassword" required/>


                            <div style={{textAlign: 'right'}}>
                                <SimpleButton variant="contained" color="primary"
                                              showProgress={loading}
                                              type="submit"
                                              onClick={this.changePassword.bind(this)}>{_t('Login.changePasswordButton')}</SimpleButton>
                            </div>
                        </form>
                        :
                        <form noValidate autoComplete="off" action="/graphql/login" method="post">
                        <Typography variant="h3" gutterBottom>{_t('Login.title')}</Typography>

                        <Typography gutterBottom>{_t('Login.subtitle', {pathname: from})}</Typography>


                        <input value={from}
                               type="hidden"
                               name="forward"/>

                        <TextField label={_t('Login.username')}
                                   error={!!error}
                                   disabled={!!loading}
                                   autoComplete="username"
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

                        {(!_app_.login || !_app_.login.hideDomain) ?
                        <TextField label={_t('Login.domain')}
                                   error={!!error}
                                   disabled={!!loading}
                                   fullWidth
                                   autoFocus
                                   value={domain}
                                   onChange={this.handleInputChange}
                                   type="text"
                                   name="domain"/>:''}

                        <div style={{textAlign: 'right'}}>
                            <SimpleButton variant="contained" color="primary"
                                          showProgress={loading}
                                          type="submit"
                                          onClick={this.login.bind(this)}>Login</SimpleButton>
                        </div>
                        {showSignupLink && <Typography>Don&apos;t have an account? <Link
                            to={signupLink || config.ADMIN_BASE_URL + '/signup'}>Sign
                            up</Link></Typography>}
                    </form>
                    }
                </Card>
            </Col>
            <Col xs={1} sm={2} md={4}></Col>
        </Row>
    }
}

LoginContainer.propTypes = {
    signupLink: PropTypes.string
}

export default LoginContainer
