import React from 'react'
import PropTypes from 'prop-types'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'


class SimpleToolbar extends React.Component {
    render() {
        const {title,classes,children,...rest} = this.props

        return <AppBar {...rest} ><Toolbar>
            <Typography variant="h6" color="inherit" sx={{flex:1}}>
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

export default SimpleToolbar
