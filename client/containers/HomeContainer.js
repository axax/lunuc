import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import BaseLayout from 'client/components/layout/BaseLayout'
import {Typography} from 'ui/admin'
import _t from 'util/i18n'

class HomeContainer extends React.Component {
    render() {

        const {user} = this.props
        return <BaseLayout>
            <Typography variant="display2" gutterBottom>{_t('admin.home.title')}</Typography>
            <Typography gutterBottom>
            {
                user.isAuthenticated ? <span>{_t('admin.home.hi',user.userData)}</span> : <span>Please login!</span>
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
