import React, {Component} from 'react'
import FileDrop from 'client/components/FileDrop'
import {withStyles} from 'ui/admin'
import PropTypes from 'prop-types'
import classNames from 'classnames'


const styles = theme => ({
    addImage: {
        background: '#FFF',
        display: 'inline-block'
    },
    addImagePopover: {
        marginTop: '10px',
        background: '#FFF',
        position: 'absolute',
        width: '300px',
        borderRadius: '2px',
        padding: '10px',
        boxShadow: '0px 4px 30px 0px rgba(220, 220, 220, 1)',
        zIndex: 1000
    },
    addImageClosedPopover: {
        display: 'none'
    },
    addImageButton: {
        boxSizing: 'border-box',
        background: '#fff',
        border: '1px solid #ddd',
        padding: 0,
        color: '#888',
        margin: 0,
        borderRadius: '1.5em',
        cursor: 'pointer',
        height: '1.5em',
        width: '2.5em',
        fontSize: '1.5em',
        lineHeight: '1.2em',
        margin: 0,
        '&:focus': {
            outline: 0
        },
        '&:hover': {
            background: '#f3f3f3'
        },
        '&:active': {
            background: '#f3f3f3'
        }
    },
    addImagePressedButton: {
        background: '#ededed'
    },
    addImageInput: {
        boxSizing: 'border-box',
        border: '1px solid #ddd',
        cursor: 'text',
        padding: '4px',
        width: '78%',
        borderRadius: '2px',
        marginBottom: '1em',
        boxShadow: 'inset 0px 1px 8px -3px #ABABAB',
        background: '#fefefe'
    },
    addImageConfirmButton: {
        boxSizing: 'border-box',
        background: '#fff',
        border: '1px solid #ddd',
        padding: 0,
        color: '#888',
        margin: 0,
        borderRadius: '2.1em',
        cursor: 'pointer',
        height: '2.1em',
        width: '18%',
        fontSize: '1em',
        lineHeight: '2.1em',
        margin: 0,
        marginLeft: '4%',
        '&:focus': {
            outline: 0
        },
        '&:hover': {
            background: '#f3f3f3'
        },
        '&:active': {
            background: '#e6e6e6'
        }
    }

})

class ImageAdd extends Component {
    // Start the popover closed
    state = {
        url: '',
        open: false,
    }

    // When the popover is open and users click anywhere on the page,
    // the popover should close
    componentDidMount() {
        document.addEventListener('click', this.closePopover)
    }

    componentWillUnmount() {
        document.removeEventListener('click', this.closePopover)
    }

    // Note: make sure whenever a click happens within the popover it is not closed
    onPopoverClick = () => {
        this.preventNextClose = true
    }

    openPopover = () => {
        if (!this.state.open) {
            this.preventNextClose = true
            this.setState({
                open: true
            })
        }
    }

    closePopover = () => {
        if (!this.preventNextClose && this.state.open) {
            this.setState({
                open: false
            })
        }

        this.preventNextClose = false
    }

    addImage = () => {
        if (this.state.url.trim() === '') return
        const {editorState, onChange} = this.props
        onChange(this.props.modifier(editorState, this.state.url), null, true)
    }

    changeUrl = (evt) => {
        this.setState({url: evt.target.value})
    }

    render() {
        const {classes} = this.props

        return (
            <div className={classes.addImage}>
                <button
                    className={classNames(classes.addImageButton, this.state.open &&
                        classes.addImagePressedButton)}
                    onMouseUp={this.openPopover}
                    type="button"
                >
                    IMG
                </button>
                <div
                    className={classNames(classes.addImagePopover, !this.state.open &&
                        classes.addImageClosedPopover)}
                    onClick={this.onPopoverClick}
                >
                    <input
                        type="text"
                        placeholder="Paste the image url …"
                        className={classes.addImageInput}
                        onChange={this.changeUrl}
                        value={this.state.url}
                    />
                    <button
                        className={classes.addImageConfirmButton}
                        type="button"
                        onClick={this.addImage}
                    >
                        Add url
                    </button>


                    <FileDrop multi={false}
                              label="or drop image here"
                              uploadTo="/graphql/upload"
                              accept="image/*"
                              resizeImages={true}
                              onSuccess={(response, ref) => {
                                  if( response.ids && response.ids.length ){

                                      const {editorState, onChange} = this.props
                                      onChange(this.props.modifier(editorState, '/uploads/'+response.ids[0]))

                                      ref.reset()
                                  }
                              }}/>
                </div>
            </div>
        )
    }
}


ImageAdd.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(ImageAdd)