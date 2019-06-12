import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from '@material-ui/core/styles'

const styles = theme => ({
    contentBlock: {
        marginBottom: theme.spacing(4)
    },
})

class ContentBlock extends React.PureComponent {
    render() {
        const {classes, children} = this.props

        return <div className={classes.contentBlock} children={children} />
    }
}


ContentBlock.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(ContentBlock)

