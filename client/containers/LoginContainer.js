import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import {withApollo} from 'react-apollo'
import gql from 'graphql-tag'
import ApolloClient from 'apollo-client'
import {Link} from 'react-router-dom'
import * as UserActions from 'client/actions/UserAction'
import * as ErrorHandlerAction from 'client/actions/ErrorHandlerAction'
import {Card, SimpleButton, TextField, Row, Col, Typography} from 'ui/admin'
import config from 'gen/config'
import BlankLayout from 'client/components/layout/BlankLayout'

class LoginContainer extends React.Component {
    state = {
        redirectToReferrer: false,
        loading: false,
        error: null,
        username: '',
        password: ''
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
            fetchPolicy: 'network-only',
            query: gql`query login($username:String!,$password:String!){login(username:$username,password:$password){token error user{username email _id role{capabilities}}}}`,
            variables: {
                username: this.state.username,
                password: this.state.password
            },
            operationName: 'login',
        }).then(response => {
            this.setState({loading: false})
            if (response.data && response.data.login) {
                this.setState({error: response.data.login.error})

                if (!response.data.login.error) {

                    this.setState({redirectToReferrer: true})
                    localStorage.setItem('token', response.data.login.token)
                    userActions.setUser(response.data.login.user, true)
                    errorHandlerAction.clearErrors()
                }
            }
        })
    }

    render() {

        const {from} = this.props.location.state || {from: {pathname: config.ADMIN_BASE_URL}}
        const {redirectToReferrer, loading, username, password, error} = this.state

        if (redirectToReferrer) {
            return (
                <Redirect to={from} push={false}/>
            )
        }

        return (
            <BlankLayout style={{marginTop: '5rem'}}>
                <Row>
                    <Col sm={1} md={4}></Col>
                    <Col sm={10} md={4}>
                        <Card>
                            <form noValidate autoComplete="off">
                                <Typography variant="display4" gutterBottom>Login</Typography>

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
                                           type="password"
                                           placeholder="Enter Password"
                                           name="password" required/>


                                <div style={{textAlign: 'right'}}>
                                    <SimpleButton variant="raised" color="primary"
                                            showProgress={loading} onClick={this.login.bind(this)}>Login</SimpleButton>
                                </div>
                                <Typography>Don&apos;t have an account? <Link to={config.ADMIN_BASE_URL + '/signup'}>Sign
                                    up</Link></Typography>
                            </form>
                        </Card>
                    </Col>
                    <Col sm={1} md={4}></Col>
                </Row>

            </BlankLayout>
        )
    }
}


LoginContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    location: PropTypes.object,
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