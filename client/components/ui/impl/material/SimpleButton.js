import React from 'react'
import PropTypes from 'prop-types'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import styled from '@emotion/styled'

const StyledCircularProgress = styled(CircularProgress)(({ theme }) => ({
    color: theme.palette.primary.light,
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -12,
    marginLeft: -12
}))

class SimpleButton extends React.Component {
    render() {
        const {showProgress,children, ...rest} = this.props

        if( showProgress ){
            return <Button
                    {...rest}
                    disabled={true}
                ><StyledCircularProgress size={24} /> {children}</Button>
        }else{
            return <Button children={children} {...rest} />
        }
    }
}


SimpleButton.propTypes = {
    showProgress: PropTypes.bool
}

export default SimpleButton

