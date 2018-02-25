import React from 'react'
import PropTypes from 'prop-types'
import List, {ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction} from 'material-ui/List'
import Paper from 'material-ui/Paper'
import DeleteIcon from 'material-ui-icons/Delete'
import IconButton from 'material-ui/IconButton'


class SimpleList extends React.Component {
    render() {
        const {items} = this.props

        return <Paper><List component="nav">
            {
                items.map((item, i) =>
                    <ListItem key={i} button={!!item.onClick} disabled={item.disabled} onClick={item.onClick}>
                        <ListItemText primary={item.primary} secondary={item.secondary}/>
                        <ListItemSecondaryAction>
                            {item.actions}
                        </ListItemSecondaryAction>
                    </ListItem>
                )
            }
        </List></Paper>
    }
}


SimpleList.propTypes = {
    items: PropTypes.array.isRequired
}

export default SimpleList