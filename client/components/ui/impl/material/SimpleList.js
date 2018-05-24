import React from 'react'
import PropTypes from 'prop-types'
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import ListItemText from '@material-ui/core/ListItemText'
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction'
import Paper from '@material-ui/core/Paper'


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