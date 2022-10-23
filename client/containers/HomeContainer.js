import React from 'react'
import PropTypes from 'prop-types'
import {Typography, Card, Divider, Row, Col} from 'ui/admin'
import Hook from '../../util/hook.cjs'

class HomeContainer extends React.Component {
    render() {

        let content

        if (_app_.user) {
            content = [<Row key="mainRow">
                <Col md={4}>
                    <Card>

                        <Typography color="textSecondary" gutterBottom>
                            System information
                        </Typography>
                        <Divider style={{margin: '5px 0'}} light/>

                        <Typography variant="h5">

                            User: <span>{_app_.user.username}</span>
                        </Typography>
                    </Card>
                </Col>
            </Row>]
        } else {
            content = <Typography gutterBottom><span>Please login!</span></Typography>
        }
        Hook.call('HomeContainerRender', {content, ...this.props})

        return content
    }
}

HomeContainer.propTypes = {
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired
}


export default HomeContainer
