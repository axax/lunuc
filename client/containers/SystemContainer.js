import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'

import extensions from 'gen/extensions'

import {ExpansionPanel} from 'ui'


class SystemContainer extends React.Component {


	render() {
        console.log(extensions)


        return <div>
            {
                Object.keys(extensions).map(k => {
                    const value = extensions[k]
                    console.log(k)
                    return <ExpansionPanel heading={value.name} key={k}>
						<p>{value.description}</p>
						</ExpansionPanel>
                })
            }
		</div>
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

