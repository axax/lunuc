import React from 'react'
import PropTypes from 'prop-types'
import AppBar from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import {withStyles} from '@material-ui/core/styles'
import Typography from '@material-ui/core/Typography'


const styles = theme => ({
    flex: {
        flex: 1
    }
})

class SimpleToolbar extends React.Component {
    render() {
        const {title,classes,children,...rest} = this.props

        return <AppBar {...rest} ><Toolbar>
            <Typography variant="h6" color="inherit" className={classes.flex}>
                {title}
            </Typography>
            {children}
        </Toolbar></AppBar>
    }
}


SimpleToolbar.propTypes = {
    title: PropTypes.string,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(SimpleToolbar)