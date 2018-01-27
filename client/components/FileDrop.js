import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, withStyles} from 'ui/admin'

const styles = theme=> ({
    holder: {
        border: '10px dashed '+theme.palette.secondary.light,
        width: '300px',
        minHeight: '300px',
        margin: '20px auto'
    }
})


class FileDrop extends React.Component {
    constructor(props) {
        super(props)
    }


    render() {
        const {classes} = this.props
        return (
            <div>
                <div className={classes.holder}>

                </div>

                <p id="upload" className="hidden"><label>Drag & drop not supported, but you can still upload via this input field:<br /><input type="file" /></label></p>
                <p id="filereader">File API & FileReader API not supported</p>
                <p id="formdata">XHR2's FormData is not supported</p>
                <p id="progress">XHR2's upload progress isn't supported</p>
                <p>Upload progress: <progress id="uploadprogress" max="100" value="0">0</progress></p>
                <p>Drag an image from your desktop on to the drop zone above to see the browser both render the preview, but also upload automatically to this server.</p>
            </div>
        )
    }
}

FileDrop.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(FileDrop)