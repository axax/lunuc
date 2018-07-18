import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import {withStyles, List, ListItem, ListItemText, Collapse, ExpandLessIcon, ExpandMoreIcon} from 'ui/admin'

const styles = theme => ({
    editor: {
        display: 'block',
        tabSize: 2
    },
    block:{

    }
})

class JsonEditor extends React.Component {

    json = null

    constructor(props) {
        super(props)

        this.json = JSON.parse(props.children)
        this.state = {
            open:{}
        }
    }

    renderJsonRec(json, key) {
        const {classes} = this.props
        if (!json) return null
        if (!key) key = 'root'

        if (json.constructor === Array) {
            const acc = []
            json.forEach((item, idx) => {
                key += '.' + idx
                acc.push(this.renderJsonRec(item, key))
            })
            return <List component="nav">{acc}</List>
        } else if (json.constructor === Object) {
            const t = (json.t || 'div')
            key += '.' + t
            return [<ListItem key={key} button onClick={this.handleClick.bind(this,key)}>
                    <ListItemText>{t}</ListItemText>
                    {!!this.state.open[key] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </ListItem>,
                <Collapse key={key+'.colapse'} in={!!this.state.open[key]} timeout="auto" unmountOnExit>
                    {this.renderJsonRec(json.c, key)}
                </Collapse>]
        } else {
            //return <ListItemText>json</ListItemText>
        }
    }

    handleClick(key){
        this.setState({open:Object.assign({},this.state.open,{ [key]:!this.state.open[key] })});
    }

    render() {

        console.log(this.state.open)
        const {classes} = this.props
        console.log(this.renderJsonRec(this.json))
        return this.renderJsonRec(this.json)

    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextState.open !== this.state.open
    }

    componentDidUpdate() {
    }


    emitChange(prop) {
        var text = ReactDOM.findDOMNode(this).innerText
        if (this.props[prop] && text !== this.lastText[prop]) {
            this.props[prop](text)
        }
        this.lastText[prop] = text
    }
}

JsonEditor.propTypes = {
    style: PropTypes.object,
    onChange: PropTypes.func,
    classes: PropTypes.object.isRequired,
}

export default withStyles(styles)(JsonEditor)