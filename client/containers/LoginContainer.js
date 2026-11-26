import React from 'react'
import PropTypes from 'prop-types'
import {Link, Redirect} from '../util/route'
import {Card, SimpleButton, TextField, Typography, VisibilityIconButton, VisibilityOffIconButton} from 'ui/admin'
import config from 'gen/config-client'
import Util from 'client/util/index.mjs'
import DomUtil from '../util/dom.mjs'
import {client} from 'client/middleware/graphql'
import {_t} from 'util/i18n.mjs'
import Hook from '../../util/hook'
import {AuthLayout, cardSx} from '../components/AuthLayout'
import {LOGIN_RESULT_FIELDS} from '../constants/index.mjs'

class LoginContainer extends React.Component {


    constructor(props) {
        super(props)
        DomUtil.noIndexNoFollow()

        const {domain, username, token, resetToken, oauth} = Util.extractQueryParams(window.location.search.substring(1))

        this.state = {
            redirectToReferrer: false,
            loading: false,
            error: null,
            username: username || '',
            password: '',
            newPassword:'',
            resetToken:token || resetToken || '',
            forgotPassword: false,
            forgotPasswordSent: false,
            // set after a correct password if the user has two-factor authentication
            twoFactorToken: null,
            passwordVisible:false,
            domain: domain ? domain : _app_.login ? _app_.login.defaultDomain : '',
            oauth: oauth==='true'
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

    forgotPassword = (e) =>{
        e.preventDefault()

        this.setState({loading: true, error: null})


        client.query({
            fetchPolicy: 'no-cache',
            query: 'query forgotPassword($username:String!,$domain:String){forgotPassword(username:$username,domain:$domain){status}}',
            variables: {
                username: this.state.username,
                // same domain as for the login - preset from ?domain= or the host rule (defaultDomain)
                domain: this.state.domain
            }
        }).then(response => {
            this.setState({loading: false, })
            if (response.data && response.data.forgotPassword) {

                if (!response.data.forgotPassword.error) {
                    this.setState({forgotPasswordSent: true})
                } else {
                    this.setState({error: response.data.forgotPassword.error})
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
            query: `query login($username:String!,$password:String!,$domain:String,$meta:String){login(username:$username,password:$password,domain:$domain,meta:$meta){${LOGIN_RESULT_FIELDS}}}`,
            variables: {
                username: this.state.username,
                password: this.state.password,
                domain: this.state.domain,
                meta: this.getLoginMeta()
            }
        }).then(response => {
            this.setState({loading: false})
            if (response.data && response.data.login) {

                if (response.data.login.twoFactorToken) {
                    this.setState({twoFactorToken: response.data.login.twoFactorToken, password: ''})
                } else if(response.data.login.redirectUrl){
                    window.location = response.data.login.redirectUrl
                }else {
                    this.loginWithResponse(response.data.login)
                }
            }
        }).catch((response) => {
            this.setState({loading: false, error: response.error.message})
        })
    }

    // also used for the second factor (see extensions/webauthn)
    getLoginMeta() {
        return JSON.stringify({
            forward: Util.extractQueryParams().forward,
            oauth: this.state.oauth
        })
    }

    loginWithResponse(login) {

        if (!login.error) {
            // clear cache completely
            client.resetStore()


            if (login.token) {
                localStorage.setItem('token', login.token)
            }

            _app_.dispatcher.setUser(login.user)

            if (login.user.requestNewPassword) {
                this.setState({
                    resetToken: login.resetToken,
                    currentUser: login.user
                })
            } else {

                // make sure translations are loaded
                window.location = this.getFromUrl()
            }

        } else {
            this.setState({error: login.error})
        }
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

        const {resetToken, forgotPassword, forgotPasswordSent, redirectToReferrer, loading, username, password, newPassword, domain, error, passwordVisible, twoFactorToken} = this.state

        if (redirectToReferrer) {
            return <Redirect to={from} push={true}/>
        }

        if (twoFactorToken && !resetToken) {
            // the second factor is provided by extensions (webauthn)
            const twoFactorContent = []
            Hook.call('LoginContainerTwoFactor', {content: twoFactorContent, container: this, twoFactorToken})
            return <AuthLayout>
                <Card sx={cardSx}>
                    {twoFactorContent.length ? twoFactorContent : <Typography>Two-factor authentication is not available</Typography>}
                </Card>
            </AuthLayout>
        }

        const loginAlternatives = []
        Hook.call('LoginContainerBeforeRender', {loginAlternatives, container: this})



        return <AuthLayout>
                {resetToken && <Card sx={cardSx}>
                    <form noValidate autoComplete="off" action="/graphql/newPassword" method="post">
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
                </Card>}

                {forgotPassword && <Card sx={cardSx}>
                    <form noValidate autoComplete="off" action="/graphql/forgotPassword" method="post">
                        <Typography variant="h3" gutterBottom>{_t('Login.forgotPassword')}</Typography>

                        {forgotPasswordSent ? <>{_t('Login.forgotPasswordSent')}</>: <><TextField label={_t('Login.username')}
                                   error={!!error}
                                   disabled={!!loading}
                                   autoComplete="username"
                                   fullWidth
                                   autoFocus
                                   value={username}
                                   onChange={this.handleInputChange}
                                   type="text"
                                   name="username" required/>

                        {(!_app_.login || !_app_.login.hideDomain) ?
                            <TextField label={_t('Login.domain')}
                                       disabled={!!loading}
                                       fullWidth
                                       value={domain}
                                       onChange={this.handleInputChange}
                                       type="text"
                                       name="domain"/> : ''}

                        <div style={{display:'flex',justifyContent: 'space-between'}}>

                            <SimpleButton onClick={()=>{
                                this.setState({forgotPassword:false, forgotPasswordSent:false})
                            }}>Login</SimpleButton>

                            <SimpleButton variant="contained" color="primary"
                                          showProgress={loading}
                                          type="submit"
                                          onClick={this.forgotPassword.bind(this)}>{_t('Login.sendForgotPassword')}</SimpleButton>

                        </div></>}

                    </form>

                </Card>}

                {!resetToken && !forgotPassword &&
                    <><Card sx={cardSx}><form noValidate autoComplete="off" action="/graphql/login" method="post">
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
                               slotProps={{input:{endAdornment: passwordVisible ? <VisibilityOffIconButton onClick={()=>{
                                       this.setState({passwordVisible:false})
                                   }} /> : <VisibilityIconButton onClick={()=>{
                                   this.setState({passwordVisible:true})
                                   }}/>}}}
                               type={passwordVisible?'text':'password'}
                               name="password" required/>

                    {(!_app_.login || !_app_.login.hideDomain) ?
                    <TextField label={_t('Login.domain')}
                               error={!!error}
                               disabled={!!loading}
                               fullWidth
                               value={domain}
                               onChange={this.handleInputChange}
                               type="text"
                               name="domain"/>:''}

                    <SimpleButton variant="contained" color="primary"
                                  fullWidth
                                  disableElevation
                                  showProgress={loading}
                                  type="submit"
                                  sx={{mt: 1}}
                                  onClick={this.login.bind(this)}>Login</SimpleButton>

                    <div style={{textAlign: 'center', marginTop: '1rem'}}>
                        <SimpleButton size="small"
                                      sx={{color: 'text.secondary', '&:hover': {color: 'text.primary', background: 'transparent'}}}
                                      onClick={()=>{
                                          this.setState({forgotPassword:true})
                                      }}>{_t('Login.forgotPassword')}</SimpleButton>
                    </div>
                    {showSignupLink && <Typography>Don&apos;t have an account? <Link
                        to={signupLink || config.ADMIN_BASE_URL + '/signup'}>Sign
                        up</Link></Typography>}
                    </form></Card>
                    {loginAlternatives}</>

                }
</AuthLayout>
    }
}

LoginContainer.propTypes = {
    signupLink: PropTypes.string
}

export default LoginContainer
