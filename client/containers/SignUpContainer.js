import React from 'react'
import PropTypes from 'prop-types'
import {graphql} from 'react-apollo'
import gql from 'graphql-tag'
import {ADMIN_BASE_URL} from 'gen/config'
import BlankLayout from 'client/components/layout/BlankLayout'
import {Link} from 'react-router-dom'
import {Card, SimpleButton, TextField, Row, Col, Typography} from 'ui/admin'

class SignUpContainer extends React.Component {
    state = {
        loading: false,
        usernameError: null,
        passwordError: null,
        emailError: null,
        username: '',
        password: '',
        email: '',
        signupFinished: false
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name

        this.setState({
            [target.name]: value
        })
    }


    signup = (e) => {
        e.preventDefault()
        this.setState({usernameError: null, passwordError: null, emailError: null})

        let hasError = false
        const {email, username, password} = this.state
        if (email.trim() === '') {
            this.setState({emailError: 'Please enter a valid email address'})
            hasError = true
        }
        if (username.trim() === '') {
            this.setState({usernameError: 'Please enter a username'})
            hasError = true
        }
        if (password.trim() === '') {
            this.setState({passwordError: 'Please enter a password'})
            hasError = true
        }

        if (hasError) {
            return
        }

        this.setState({loading: true})
        const {mutate} = this.props


        mutate({
            variables: {
                email,
                username,
                password
            }
        }).then(({data,errors}) => {
            if( errors && errors.length){
                errors.forEach(e=>{
                    if( e.state ){
                        this.setState(e.state)
                    }
                })
                this.setState({loading: false})
            }else{
                this.setState({loading: false, signupFinished: true})
            }
        })

    }

    render() {

        const {signupFinished, email, username, password, loading, usernameError, passwordError, emailError} = this.state

        return (
            <BlankLayout style={{marginTop: '5rem'}}>
                <Row>
                    <Col sm={1} md={4}></Col>
                    <Col sm={10} md={4}>
                        <Card>
                            <Typography type="display4" gutterBottom>Sign up</Typography>

                            {signupFinished ?
                                <Typography gutterBottom>Thanks for your registration! <Link to={ADMIN_BASE_URL + '/login'}>Login</Link></Typography> :
                                <form>

                                    <TextField label="Username"
                                               error={!!usernameError}
                                               helperText={usernameError}
                                               disabled={!!loading}
                                               autoComplete="username"
                                               fullWidth
                                               autoFocus
                                               value={username}
                                               onChange={this.handleInputChange}
                                               type="text"
                                               placeholder="Enter username"
                                               name="username" required/>

                                    <TextField label="Email"
                                               error={!!emailError}
                                               helperText={emailError}
                                               disabled={!!loading}
                                               autoComplete="email"
                                               fullWidth
                                               value={email}
                                               onChange={this.handleInputChange}
                                               type="text"
                                               placeholder="Enter email"
                                               name="email" required/>


                                    <TextField label="Password"
                                               error={!!passwordError}
                                               helperText={passwordError}
                                               disabled={!!loading}
                                               fullWidth
                                               autoComplete="new-password"
                                               value={password}
                                               onChange={this.handleInputChange}
                                               type="password"
                                               placeholder="Enter Password"
                                               name="password" required/>

                                    <div style={{textAlign: 'right'}}>
                                        <SimpleButton raised color="primary"
                                                      showProgress={loading} onClick={this.signup.bind(this)}>Sign
                                            up</SimpleButton>
                                    </div>
                                    <Typography gutterBottom> Already have an account? <Link to={ADMIN_BASE_URL + '/login'}>Login</Link></Typography>

                                </form>
                            }
                        </Card>
                    </Col>
                    <Col sm={1} md={4}></Col>
                </Row>
            </BlankLayout>
        )
    }
}

SignUpContainer.propTypes = {
    mutate: PropTypes.func,
}

const gqlCreateUser = gql`
  mutation createUser($email: String!, $username: String!, $password: String!) {
    createUser(email: $email, username: $username, password: $password) {
      email password username _id
    }
  }
`

const SignUpContainerWithGql = graphql(gqlCreateUser, {
    options(ownProps) {
        return {
            fetchPolicy:'network-only',
            errorPolicy: 'all'
        }
    }
})(SignUpContainer)

export default SignUpContainerWithGql