import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Typography, Card, Divider, Row, Col} from 'ui/admin'
import _t from 'util/i18n'

class HomeContainer extends React.Component {
    render() {
        const {user} = this.props
        return <BaseLayout>
            <Typography variant="h3" component="h1" gutterBottom>Administration console</Typography>

            {
                user.isAuthenticated ?
                    <Row>
                        <Col md={4}>
                            <Card>

                                <Typography color="textSecondary" gutterBottom>
                                    System information
                                </Typography>
                                <Divider style={{margin: '5px 0'}} light/>

                                <Typography variant="h5">

                                    User:  <span>{user.userData.username}</span>
                                </Typography>
                            </Card>
                        </Col>
                    </Row>
                    : <Typography gutterBottom><span>Please login!</span></Typography>
            }


        </BaseLayout>
    }
}

HomeContainer.propTypes = {
    user: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    const {user} = store
    return {
        user
    }
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(HomeContainer)
