import React from 'react'
import PropTypes from 'prop-types'
import {
    Fab,
    AddIcon,
    List,
    ListItem,
    TextField,
    ListItemSecondaryAction,
    DeleteIconButton,
    EditIconButton,
    SimpleDialog
} from 'ui/admin'
import FilesContainer from 'client/containers/FilesContainer'
import styled from '@emotion/styled'

const StyledFab = styled(Fab)(({theme})=>({
    position: 'absolute',
    bottom: '0px',
    right: '0px',
    margin: theme.spacing(1)
}))


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
        const {resourcesArray} = this.state

        return <div style={{marginBottom: '30px'}}>
            <List dense={true}>
                {resourcesArray.map((item, i) => {
                    let src
                    if(item.constructor === Object){
                        src = item.src
                        item = JSON.stringify(item)
                    }else{
                        src = item
                    }
                    const isExternal = src.match(/[a-zA-Z0-9]*:\/\/[^\s]*/g) != null
                    return <ListItem key={'resource-' + i}>
                        <TextField value={item}
                                   onChange={this.handleChange.bind(this, i)}
                                   style={{width: '80%'}}
                                   placeholder="Enter a url"/>
                        <ListItemSecondaryAction>
                            {!isExternal && <EditIconButton onClick={this.handleEditClick.bind(this, item)}/>}
                            <DeleteIconButton onClick={this.handleRemoveClick.bind(this, i)}/>
                        </ListItemSecondaryAction>
                    </ListItem>
                })
                }
            </List>
            <StyledFab
                size="small"
                onClick={this.handleAddClick.bind(this)}
                color="secondary"
                aria-label="Add">
                <AddIcon />
            </StyledFab>
            <SimpleDialog open={!!this.state.editResource} onClose={this.handleDialogClose.bind(this)}
                          actions={[{
                              key: 'ok',
                              label: 'Ok',
                              type: 'primary'
                          }]}
                          title="Edit Resource">

                <FilesContainer editOnly space="./build/" file={this.state.editResource} embedded />
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
        let val = e.target.value.trim()
        if(val.startsWith('{')){
            try {
                val = JSON.parse(val)
            }catch (e) {

            }
        }
        resourcesArray[i] = val
        this.setState({resourcesArray}, this.emitChange.bind(this, true))
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
            console.log(this.state.resourcesArray)
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
    resources: PropTypes.string,
    onChange: PropTypes.func
}

export default ResourceEditor
