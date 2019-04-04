import React from 'react'
import PropTypes from 'prop-types'
import {
    Fab,
    AddIcon,
    withStyles,
    List,
    ListItem,
    TextField,
    ListItemSecondaryAction,
    DeleteIconButton,
    EditIconButton,
    SimpleDialog
} from 'ui/admin'
import FilesContainer from 'client/containers/FilesContainer'


const styles = theme => ({
    resources: {
        marginBottom: '30px'
    },
    textfield: {
        width: '80%'
    },
    fab: {
        position: 'absolute',
        bottom: '0px',
        right: '0px',
        margin: theme.spacing.unit
    }
})

class ResourceEditor extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            resources: '',
            resourcesArray: [],
            editResource: false
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const {resources} = nextProps

        if (resources !== prevState.resources) {
            try {
                let resourcesArray = JSON.parse(resources)
                if (!resourcesArray) resourcesArray = []
                return Object.assign({}, prevState, {resources, resourcesArray})
            } catch (e) {
            }
        }

        return null
    }

    render() {
        const {classes, ...rest} = this.props
        const {resourcesArray} = this.state

        return <div className={classes.resources}>
            <List dense={true}>
                {resourcesArray.map((item, i) => {
                    const isExternal = item.match(/[a-zA-Z0-9]*:\/\/[^\s]*/g) != null
                    return <ListItem key={'resource-' + i}>
                        <TextField value={item} onBlur={this.handleBlur.bind(this, i)}
                                   onChange={this.handleChange.bind(this, i)} className={classes.textfield}
                                   placeholder="Enter a url"/>
                        <ListItemSecondaryAction>
                            {!isExternal && <EditIconButton onClick={this.handleEditClick.bind(this, item)}/>}
                            <DeleteIconButton onClick={this.handleRemoveClick.bind(this, i)}/>
                        </ListItemSecondaryAction>
                    </ListItem>
                })
                }
            </List>
            <Fab
                size="small"
                onClick={this.handleAddClick.bind(this)}
                color="secondary"
                aria-label="Add"
                className={classes.fab}>
                <AddIcon />
            </Fab>
            <SimpleDialog open={!!this.state.editResource} onClose={this.handleDialogClose.bind(this)}
                          actions={[{
                              key: 'ok',
                              label: 'Ok',
                              type: 'primary'
                          }]}
                          title="Edit Resource">

                <FilesContainer editOnly dir="./build/" file={this.state.editResource} embedded />
            </SimpleDialog>
        </div>


    }

    handleDialogClose() {
        this.setState({editResource: false})

    }

    handleAddClick() {
        const resourcesArray = this.state.resourcesArray
        resourcesArray.push('/style.css')
        this.setState({resourcesArray}, this.emitChange)

    }

    handleEditClick(item) {
        this.setState({editResource: item})

    }

    handleChange(i, e) {
        const resourcesArray = this.state.resourcesArray
        resourcesArray[i] = e.target.value
        this.setState({resourcesArray}, this.emitChange.bind(this, true))
    }

    handleBlur(i, e) {
        const resourcesArray = this.state.resourcesArray
        resourcesArray[i] = e.target.value
        this.setState({resourcesArray}, this.emitChange)
    }

    handleRemoveClick(i) {
        const resourcesArray = this.state.resourcesArray
        resourcesArray.splice(i, 1)
        this.setState({resourcesArray}, this.emitChange)
    }

    emitChange(delayed) {
        const {onChange, resources} = this.props
        if (onChange) {
            clearTimeout(this.emitChangeTimeout)
            const data = JSON.stringify(this.state.resourcesArray)
            if (data !== resources) {
                if (delayed) {
                    this.emitChangeTimeout = setTimeout(() => {
                        onChange(data)
                    }, 1000)
                } else {
                    onChange(data)
                }
            }
        }
    }
}

ResourceEditor.propTypes = {
    classes: PropTypes.object.isRequired,
    resources: PropTypes.string,
    onChange: PropTypes.func
}

export default withStyles(styles)(ResourceEditor)

