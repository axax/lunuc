import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Typography} from 'ui/admin'

class HomeContainer extends React.Component {
    render() {

        const {user} = this.props
        return <BaseLayout>
            <Typography type="display1" gutterBottom>Administration console</Typography>
            <Typography gutterBottom>
            {
                user.isAuthenticated ? <span>Hi {user.userData.username}!</span> : <span>Please login!</span>
            }
            </Typography>
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
