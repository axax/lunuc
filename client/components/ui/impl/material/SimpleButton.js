import React from 'react'
import PropTypes from 'prop-types'
import Button from '@material-ui/core/Button'
import {withStyles} from '@material-ui/core/styles'
import CircularProgress from '@material-ui/core/CircularProgress'

const styles = theme => ({
    buttonProgress: {
        color: theme.palette.primary.light,
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -12,
        marginLeft: -12,
    },
})

class SimpleButton extends React.Component {
    render() {
        const {classes,showProgress,children, ...rest} = this.props

        if( showProgress ){
            return <Button
                    {...rest}
                    disabled={true}
                ><CircularProgress size={24} className={classes.buttonProgress} /> {children}</Button>
        }else{
            return <Button children={children} {...rest} />
        }
    }
}


SimpleButton.propTypes = {
    classes: PropTypes.object.isRequired,
    showProgress: PropTypes.bool
}

export default withStyles(styles)(SimpleButton)

