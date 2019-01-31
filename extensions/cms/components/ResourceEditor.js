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
    DeleteIconButton
} from 'ui/admin'

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
            resourcesArray: []
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const {resources} = nextProps

        if (resources !== prevState.resources) {
            try {
                let resourcesArray = JSON.parse(resources)
                if( !resourcesArray ) resourcesArray = []
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
                    return <ListItem key={'resource-' + i}>
                        <TextField value={item} onBlur={this.handleBlur.bind(this, i)} onChange={this.handleChange.bind(this, i)} className={classes.textfield}
                                   placeholder="Enter a url"/>
                        <ListItemSecondaryAction>
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
        </div>


    }

    handleAddClick() {
        const resourcesArray = this.state.resourcesArray
        resourcesArray.push('/style.css')
        this.setState({resourcesArray}, this.emitChange)

    }

    handleChange(i, e) {
        const resourcesArray = this.state.resourcesArray
        resourcesArray[i] = e.target.value
        this.setState({resourcesArray}, this.emitChange.bind(this,true))
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
            if( data !== resources) {
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

