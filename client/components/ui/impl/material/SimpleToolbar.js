import React from 'react'
import PropTypes from 'prop-types'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import {withStyles} from '@mui/styles'
import Typography from '@mui/material/Typography'


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
