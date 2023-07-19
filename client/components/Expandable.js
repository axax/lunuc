import React from 'react'
import PropTypes from 'prop-types'
import {Typography, ExpansionPanel} from 'ui/admin'
import Grid from '@mui/material/Grid'
import {getIconByKey} from './ui/impl/material/icon'
import styled from '@emotion/styled'


const StyledDropArea = styled('div')(({ theme }) => ({
    padding: '0',
    display:'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex:9999,
    width: `calc(100% - ${theme.spacing(12)})`,
    opacity: '0',
    position:'absolute',
    fontSize: '0.8rem',
    backgroundColor: 'rgba(255,0,0,0.3)'
}))

class Expandable extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            expanded: !!props.expanded
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (!prevState || nextProps.expanded !== prevState.expandedOri) {
            return {
                expanded: !!nextProps.expanded,
                expandedOri: !!nextProps.expanded
            }
        }
        return null
    }


    render() {
        const {title, children, disableGutters, icon, draggable, index} = this.props

        let Icon
        if(icon) {
            Icon = getIconByKey(icon)
        }
        const MyExpansionPanel = <ExpansionPanel disableGutters={disableGutters}
                                                 expanded={this.state.expanded}
                                                 onChange={this.handleExpansion.bind(this)}
                                                heading={<Grid
                                                draggable={draggable}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text', index)
                                                }}
                                                container
                                                direction="row"
                                                justifyContent="flex-start"
                                                alignItems="center">{Icon ? <Icon color="action"  fontSize="medium" sx={{mr:2}}/>: null}<Typography variant="h6">{title}</Typography></Grid>}>
            {this.state.expanded ? <div style={{width: '100%'}}>
                {children}
            </div> : null}
        </ExpansionPanel>

        if(draggable){
            const DropArea = <StyledDropArea
                onDrop={(e) => {
                    const sourceIndex = parseInt(e.dataTransfer.getData("text"))

                    if(sourceIndex !== index){
                        this.props.onPositionChange(sourceIndex, index)
                    }

                    e.target.style.opacity = 0
                }}
                onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    e.target.style.opacity = 1
                }}
                onDragLeave={(e) => {
                    e.target.style.opacity = 0
                }}>Hier plazieren</StyledDropArea>

            return [
                index===0?DropArea:null,
                MyExpansionPanel,
                DropArea]
        } else {
            return MyExpansionPanel
        }

    }

    handleExpansion(e, expanded) {
        const {onChange} = this.props
        this.setState({expanded})
        if (onChange) {
            onChange(expanded)
        }
    }
}

Expandable.propTypes = {
    children: PropTypes.any,
    title: PropTypes.string,
    onChange: PropTypes.func,
    expanded: PropTypes.bool
}

export default Expandable

