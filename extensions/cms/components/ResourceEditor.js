import React from 'react'
import PropTypes from 'prop-types'
import {Fab, AddIcon, withStyles} from 'ui/admin'

const styles = theme => ({
    fab: {
        position: 'absolute',
        bottom: '0px',
        right: '0px',
        margin: theme.spacing.unit
    }
})

class ResourceEditor extends React.Component {
    render(){
        const {classes, ...rest} = this.props

        return <Fab size="small" color="secondary" aria-label="Add" className={classes.fab}>
            <AddIcon />
        </Fab>
    }
}

ResourceEditor.propTypes = {
    classes: PropTypes.object.isRequired,
    resources: PropTypes.array
}

export default withStyles(styles)(ResourceEditor)

