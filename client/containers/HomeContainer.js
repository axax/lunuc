import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Typography, Card, Divider, Row, Col} from 'ui/admin'
import Hook from '../../util/hook'

class HomeContainer extends React.Component {
    render() {
        const {user} = this.props

        let content

        if (user.isAuthenticated) {
            content = [<Row key="mainRow">
                <Col md={4}>
                    <Card>

                        <Typography color="textSecondary" gutterBottom>
                            System information
                        </Typography>
                        <Divider style={{margin: '5px 0'}} light/>

                        <Typography variant="h5">

                            User: <span>{user.userData.username}</span>
                        </Typography>
                    </Card>
                </Col>
            </Row>]
        } else {
            content = <Typography gutterBottom><span>Please login!</span></Typography>
        }
        Hook.call('HomeContainerRender', {content, ...this.props})

        return <BaseLayout>{content}</BaseLayout>
    }
}

HomeContainer.propTypes = {
    user: PropTypes.object.isRequired,
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired
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
