import React from 'react'
import PropTypes from 'prop-types'
import {Typography, ExpansionPanel} from 'ui/admin'
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import {getIconByKey} from './ui/impl/material/icon'

/*
 * Drag and drop of the entries of a list (e.g. the images of a multi field in GenericForm):
 * an entry is dragged by its handle, a line shows where it will be dropped (above or below the entry under the
 * pointer). Only entries with the same dragGroup accept the drop. The dragged entry is kept here (the dataTransfer
 * data can not be read during dragover).
 */
let currentDrag = null

class Expandable extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            expanded: !!props.expanded,
            dragging: false,
            // 'before' | 'after' | null: where a dragged entry would be dropped
            dropPosition: null
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

    canDrop() {
        const {index, dragGroup} = this.props
        return currentDrag && currentDrag.group === dragGroup && currentDrag.index !== index
    }

    handleDragStart = (e) => {
        const {index, dragGroup} = this.props
        currentDrag = {group: dragGroup, index}
        e.dataTransfer.effectAllowed = 'move'
        // some browsers only start a drag with data
        e.dataTransfer.setData('text/plain', String(index))
        // the whole entry as drag image, not only the handle
        if (this._root && e.dataTransfer.setDragImage) {
            e.dataTransfer.setDragImage(this._root, 24, 24)
        }
        // after the drag image was taken
        setTimeout(() => this.setState({dragging: true}), 0)
    }

    handleDragEnd = () => {
        currentDrag = null
        this.setState({dragging: false, dropPosition: null})
    }

    handleDragOver = (e) => {
        if (!this.canDrop()) {
            return
        }
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const dropPosition = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
        if (dropPosition !== this.state.dropPosition) {
            this.setState({dropPosition})
        }
    }

    handleDragLeave = (e) => {
        // moving into a child element also fires dragleave
        if (!e.currentTarget.contains(e.relatedTarget) && this.state.dropPosition) {
            this.setState({dropPosition: null})
        }
    }

    handleDrop = (e) => {
        const {index, onPositionChange} = this.props
        const {dropPosition} = this.state
        this.setState({dropPosition: null})
        if (!this.canDrop() || !dropPosition) {
            return
        }
        e.preventDefault()
        const sourceIndex = currentDrag.index
        currentDrag = null
        // onPositionChange removes the source first and inserts it at targetIndex
        let targetIndex = dropPosition === 'after' ? index + 1 : index
        if (sourceIndex < targetIndex) {
            targetIndex--
        }
        if (targetIndex !== sourceIndex && onPositionChange) {
            onPositionChange(sourceIndex, targetIndex)
        }
    }

    render() {
        const {title, children, disableGutters, icon, draggable, passThrough, className, actions} = this.props
        const {dragging, dropPosition} = this.state

        let Icon
        if (icon) {
            Icon = getIconByKey(icon)
        }
        if (passThrough) {
            return children
        }

        const headingTitle = <Grid
            container
            direction="row"
            justifyContent="flex-start"
            wrap={actions || draggable ? 'nowrap' : undefined}
            style={actions || draggable ? {width: 'auto', minWidth: 0, flex: '0 1 auto'} : undefined}
            alignItems="center">
            {draggable ? <Box component="span"
                              draggable={true}
                              onDragStart={this.handleDragStart}
                              onDragEnd={this.handleDragEnd}
                              // the handle must not open / close the panel
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Verschieben"
                              sx={{
                                  display: 'flex', alignItems: 'center', ml: -1, mr: 0.5, p: 0.25, borderRadius: 1,
                                  cursor: 'grab', color: 'text.disabled',
                                  '&:hover': {color: 'text.secondary', bgcolor: 'action.hover'},
                                  '&:active': {cursor: 'grabbing'}
                              }}><DragIndicatorIcon fontSize="small"/></Box> : null}
            {Icon ? <Icon color="action" fontSize="medium" sx={{mr: 2}}/> : null}
            <Typography variant="h6"
                        sx={actions || draggable ? {
                            m: 0, lineHeight: '1.75rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        } : undefined}>{title}</Typography>
        </Grid>

        const panel = <ExpansionPanel disableGutters={disableGutters}
                                      className={className}
                                      expanded={this.state.expanded}
                                      onChange={this.handleExpansion.bind(this)}
                                      id={this.props.id}
                                      heading={actions ?
                                          <div style={{display: 'flex', alignItems: 'center', width: '100%', minWidth: 0}}>
                                              {headingTitle}
                                              <div className="expandable-actions"
                                                   // fixed height: the row must not grow when the delete question is shown
                                                   style={{marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.125rem',
                                                       height: '1.75rem', paddingLeft: '0.5rem', flexShrink: 0}}
                                                   // buttons in the heading must not open / close the panel
                                                   onClick={(e) => e.stopPropagation()}
                                                   onFocus={(e) => e.stopPropagation()}>{actions}</div>
                                          </div> : headingTitle}>
            {this.state.expanded ? <div style={{width: '100%'}}>
                {children}
            </div> : null}
        </ExpansionPanel>

        if (!draggable) {
            return panel
        }

        return <Box ref={el => this._root = el}
                    onDragOver={this.handleDragOver}
                    onDragLeave={this.handleDragLeave}
                    onDrop={this.handleDrop}
                    sx={{
                        position: 'relative',
                        opacity: dragging ? 0.4 : 1,
                        transition: 'opacity 0.15s ease'
                    }}>
            {panel}
            {dropPosition && <Box aria-hidden="true" sx={{
                position: 'absolute', left: 0, right: 0, height: '3px', borderRadius: '3px',
                bgcolor: 'primary.main', pointerEvents: 'none', zIndex: 2,
                // in the gap between two entries
                ...(dropPosition === 'before' ? {top: '-5px'} : {bottom: '-5px'})
            }}/>}
        </Box>
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
    // buttons shown in the heading (e.g. delete), usable without expanding the panel
    actions: PropTypes.node,
    onChange: PropTypes.func,
    expanded: PropTypes.bool,
    // entries of a list can be reordered by dragging their handle
    draggable: PropTypes.bool,
    index: PropTypes.number,
    // only entries of the same group accept a drop (e.g. the field name)
    dragGroup: PropTypes.string,
    onPositionChange: PropTypes.func
}

export default Expandable
