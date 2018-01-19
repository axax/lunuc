import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import extensions from 'gen/extensions'
import {ExpansionPanel} from 'ui'
import BaseLayout from '../components/layout/BaseLayout'
import {Typography} from 'ui'


class SystemContainer extends React.Component {


    render() {
        return <BaseLayout>
            <Typography type="display1" gutterBottom>Extensions</Typography>
            {
                Object.keys(extensions).map(k => {
                    const value = extensions[k]

                    return <ExpansionPanel heading={<Typography type="headline">{value.name}</Typography>} key={k}>
                        <div><Typography type="body1" gutterBottom>{value.description}</Typography></div>
                        <Typography type="caption" gutterBottom>Types</Typography>
                    </ExpansionPanel>
                })
            }
        </BaseLayout>
    }
}


SystemContainer.propTypes = {
    user: PropTypes.object,
}


const mapStateToProps = (store) => {
    const {user} = store
    return {
        user
    }
}

export default connect(
    mapStateToProps
)(SystemContainer)

