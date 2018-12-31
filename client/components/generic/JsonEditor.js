import React from 'react'
import PropTypes from 'prop-types'
import {
    withStyles,
    List,
    ListItem,
    ListItemText,
    Collapse,
    ExpandLessIcon,
    ExpandMoreIcon,
    TextField,
    AddIconButton,
    ClearIconButton
} from 'ui/admin'
import Util from 'client/util'

const styles = theme => ({
    type: {
        fontWeight: 'bold'
    }
})

class JsonEditor extends React.Component {

    json = null

    constructor(props) {
        super(props)
        try {
            this.json = JSON.parse(props.children)
        } catch (e) {
            console.log(e)
        }

        this.state = {
            open: {}
        }
    }

    renderJsonRec(json, key, level) {
        const {classes} = this.props
        if (!json) return null
        if (!key) key = '0'
        if (!level) level = 0

        if (json.constructor === Array) {
            const acc = []
            json.forEach((item, idx) => {
                acc.push(this.renderJsonRec(item, key + '.' + idx, level + 1))
            })
            return <List component="nav">{acc}</List>
        } else if (json.constructor === Object) {
            const t = (json.t || 'div')
            const props = []
            Object.keys(json).forEach(k => {
                if (k !== 't' && k !== 'c') {
                    props.push(<ListItem style={{paddingLeft: 10 * level + 10}}
                                         key={key + '.' + k}><ListItemText>{k + ' = ' + JSON.stringify(json[k])}</ListItemText></ListItem>)
                }
            })

            let newkey = key, newlevel = level
            if (json.c && json.c.constructor === Object) {
                newkey += '.0'
                newlevel++
            }


            return [<ListItem onMouseOver={() => {
                console.log('TODO: implement highlighting')
            }} key={key} style={{paddingLeft: 10 * level}} button
                              onClick={this.handleClick.bind(this, key)}>
                <ListItemText classes={{primary: classes.type}}>{t}</ListItemText>
                <AddIconButton></AddIconButton>
                <ClearIconButton></ClearIconButton>
                { json.c && (!!this.state.open[key] ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
            </ListItem>,
                <Collapse key={key + '.colapse'} in={!!this.state.open[key]} timeout="auto" unmountOnExit>
                    {props}
                    {this.renderJsonRec(json.c, newkey, newlevel)}

                </Collapse>]
        } else {
            return <ListItem style={{paddingLeft: 10 * level + 10}} key={key + '.c'}><ListItemText>
                <TextField fullWidth value={json} onChange={e => {
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
            this.forceUpdate()
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