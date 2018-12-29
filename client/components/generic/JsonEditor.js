import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import {withStyles, List, ListItem, ListItemText, Collapse, ExpandLessIcon, ExpandMoreIcon, TextField} from 'ui/admin'
import Util from 'client/util'

const styles = theme => ({
    editor: {
        display: 'block',
        tabSize: 2
    },
    block: {}
})

class JsonEditor extends React.Component {

    json = null

    constructor(props) {
        super(props)
        try {
            this.json = JSON.parse(props.children.replace(/\\\\"/g, '\\"'))
        } catch (e) {
            console.log(e)
        }

        this
            .state = {
            open: {}
        }
    }

    renderJsonRec(json, key) {
        const {classes} = this.props
        if (!json) return null
        if (!key) key = 'root'

        if (json.constructor === Array) {
            const acc = []
            json.forEach((item, idx) => {
                console.log(key + '.' + idx, item)
                acc.push(this.renderJsonRec(item, key + '.' + idx))
            })
            return <List component="nav">{acc}</List>
        } else if (json.constructor === Object) {
            const t = (json.t || 'div')
            const props = []
            Object.keys(json).forEach(k => {
                if (k !== 't' && k !== 'c') {
                    props.push(<ListItem
                        key={key + '.' + k}><ListItemText>{k + ' = ' + JSON.stringify(json[k])}</ListItemText></ListItem>)
                }
            })

            return [<ListItem key={key} button onClick={this.handleClick.bind(this, key)}>
                <ListItemText>{t}</ListItemText>
                {!!this.state.open[key] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </ListItem>,
                <Collapse key={key + '.colapse'} in={!!this.state.open[key]} timeout="auto" unmountOnExit>
                    {props}
                    {this.renderJsonRec(json.c, key + (json.c && json.c.constructor === Object ? '.0' : ''))}

                </Collapse>]
        } else {
            return <ListItem key={key + '.c'}><ListItemText>
                <TextField value={json} onChange={e => {
                    this.setChildComponent(key, e.target.value)
                }
                } onBlur={e => {
                    this.props.onBlur(JSON.stringify(this.json, null, 4))
                }}/>
            </ListItemText></ListItem>
        }
    }

    setChildComponent(key, value) {
        const o = Util.getComponentByKey(key, this.json)
        if (o) {
            o.c = value
            this.props.onChange(JSON.stringify(this.json, null, 4))
        }
    }

    handleClick(key) {
        this.setState({open: Object.assign({}, this.state.open, {[key]: !this.state.open[key]})});
    }

    render() {
        return this.renderJsonRec(this.json)
    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextState.open !== this.state.open || nextProps.children != this.props.children
    }

}

JsonEditor.propTypes = {
    style: PropTypes.object,
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    classes: PropTypes.object.isRequired,
}

export default withStyles(styles)(JsonEditor)