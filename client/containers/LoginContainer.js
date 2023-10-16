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
    state = {
        redirectToReferrer: false,
        loading: false,
        error: null,
        username: '',
        password: '',
        domain: _app_.login ? _app_.login.defaultDomain : ''
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

        this.setState({
            [target.name]: value
        })
    }


    login = (e) => {
        e.preventDefault()

        this.setState({loading: true, error: null})

        client.query({
            fetchPolicy: 'no-cache',
            query: 'query login($username:String!,$password:String!,$domain:String){login(username:$username,password:$password,domain:$domain){token error user{username email _id role{_id capabilities}}}}',
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

                    // make sure translations are loaded
                    window.location = this.getFromUrl()

                } else {
                    this.setState({error: response.data.login.error})
                }
            }
        }).catch((response) => {
            console.log(response)
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

        const {redirectToReferrer, loading, username, password, domain, error} = this.state

        if (redirectToReferrer) {
            return <Redirect to={from} push={true}/>
        }

        return <Row style={{marginTop: '5rem'}}>
            <Col xs={1} sm={2} md={4}></Col>
            <Col xs={10} sm={8} md={4}>
                <Card>
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
