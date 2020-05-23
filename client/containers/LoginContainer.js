import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import {withApollo} from '@apollo/react-hoc'
import {gql} from '@apollo/client'
import { ApolloClient } from '@apollo/client'
import {Link} from 'react-router-dom'
import * as UserActions from 'client/actions/UserAction'
import * as ErrorHandlerAction from 'client/actions/ErrorHandlerAction'
import {Card, SimpleButton, TextField, Row, Col, Typography} from 'ui/admin'
import config from 'gen/config'
import BlankLayout from 'client/components/layout/BlankLayout'
import Util from 'client/util'
import DomUtil from '../util/dom'

class LoginContainer extends React.Component {
    state = {
        redirectToReferrer: false,
        loading: false,
        error: null,
        username: '',
        password: ''
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
        DomUtil.removeElements('#metaTagNoIndex')
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
        const {client, userActions, errorHandlerAction} = this.props


        client.query({
            fetchPolicy: 'no-cache',
            query: gql`query login($username:String!,$password:String!){login(username:$username,password:$password){token error user{username email _id role{_id capabilities}}}}`,
            variables: {
                username: this.state.username,
                password: this.state.password
            },
            operationName: 'login'
        }).then(response => {
            this.setState({loading: false})
            if (response.data && response.data.login) {

                if (!response.data.login.error) {
                    // clear cache completely
                    client.resetStore()

                    localStorage.setItem('token', response.data.login.token)
                    userActions.setUser(response.data.login.user, true)
                    errorHandlerAction.clearErrors()
                    this.setState({redirectToReferrer: true})

                } else {
                    this.setState({error: response.data.login.error})
                }
            }
        })
    }

    render() {
        const {signupLink, location} = this.props
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

        const {redirectToReferrer, loading, username, password, error} = this.state

        if (redirectToReferrer) {
            return <Redirect to={from} push={false}/>
        }

        return (
            <BlankLayout style={{marginTop: '5rem'}}>
                <Row>
                    <Col xs={1} sm={2} md={4}></Col>
                    <Col xs={10} sm={8} md={4}>
                        <Card>
                            <form noValidate autoComplete="off">
                                <Typography variant="h3" gutterBottom>Login</Typography>

                                <Typography gutterBottom>You must log in to view the page
                                    at {from.pathname}</Typography>


                                <TextField label="Username"
                                           error={!!error}
                                           disabled={!!loading}
                                           autoComplete="current-password"
                                           fullWidth
                                           autoFocus
                                           value={username}
                                           onChange={this.handleInputChange}
                                           type="text"
                                           placeholder="Enter Username"
                                           name="username" required/>


                                <TextField label="Password"
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
                                           placeholder="Enter Password"
                                           name="password" required/>


                                <div style={{textAlign: 'right'}}>
                                    <SimpleButton variant="contained" color="primary"
                                                  showProgress={loading}
                                                  onClick={this.login.bind(this)}>Login</SimpleButton>
                                </div>
                                <Typography>Don&apos;t have an account? <Link to={signupLink || config.ADMIN_BASE_URL + '/signup'}>Sign
                                    up</Link></Typography>
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
    client: PropTypes.instanceOf(ApolloClient).isRequired,
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


const LoginContainerWithApollo = withApollo(LoginContainer)

/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(LoginContainerWithApollo)
