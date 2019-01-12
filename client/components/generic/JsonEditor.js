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
    ClearIconButton,
    SimpleAutosuggest,
    SimpleMenu
} from 'ui/admin'
import Util from 'client/util'

const styles = theme => ({
    type: {
        fontWeight: 'bold'
    }
})
import JsonDom from '../JsonDom'

class JsonEditor extends React.Component {

    static components = null
    json = null

    constructor(props) {
        super(props)
        try {
            this.json = JSON.parse(props.children)
        } catch (e) {
            console.log(e)
        }

        if (!JsonEditor.components) {
            JsonEditor.components = Object.keys(JsonDom.components).map((key) => {
                let label
                const o = JsonDom.components[key]
                if (o.constructor === Object) {
                    label = o.label
                } else {
                    label = key
                }
                return {key, label}
            })
            JsonEditor.components.push({key: 'div', label: 'Arbitrary block of content'})
            console.log('JsonEditor components created')
        }

//console.log(JsonDom.components)
        this.state = {
            open: {}
        }
    }

    renderJsonRec(json, key, level) {
        const {classes} = this.props
        if (json === undefined) return null
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

            /* <span
             onClick={e => {
             e.stopPropagation()
             return false
             }}
             onKeyUp={e => {
             this.setChildComponent(key, e.target.innerText.trim(), 't')
             }
             }
             onBlur={e => {
             }}
             suppressContentEditableWarning={true}
             contentEditable>{t}</span> */
            return [<ListItem dense disableRipple onMouseOver={() => {
                console.log('TODO: implement highlighting')
            }} key={key} style={{paddingLeft: 10 * level}} button
                              onClick={this.handleClick.bind(this, key)}>

                <SimpleMenu mini fab color="secondary" items={[{
                    name: 'Add child component', onClick: e => {
                        e.stopPropagation()
                        this.addComponent(key)
                        return false
                    }
                }, {
                    name: 'Remove this component', onClick: e => {
                        e.stopPropagation()
                        this.removeComponent(key)
                        return false
                    }
                }]}/>
                <ListItemText classes={{primary: classes.type}}>

                    <SimpleAutosuggest placeholder="Enter component type" value={t}
                                       onBlur={(e, v) => {
                                           console.log(v)
                                       }
                                       } onClick={e => {
                        e.stopPropagation()
                        return false
                    }} items={JsonEditor.components}/>
                </ListItemText>
                { json.c !== undefined && (!!this.state.open[key] ? <ExpandLessIcon /> : <ExpandMoreIcon />)}
            </ListItem>,
                <Collapse key={key + '.colapse'} in={!!this.state.open[key]} timeout="auto" unmountOnExit>
                    {props}
                    {this.renderJsonRec(json.c, newkey, newlevel)}

                </Collapse>
            ]
        } else {
            return <ListItem style={{paddingLeft: 10 * level + 10}} key={key + '.c'}><ListItemText>
                <TextField placeholder="Enter some content" fullWidth value={json} onChange={e => {
                    this.setChildComponent(key, e.target.value)
                }
                } onBlur={e => {
                    this.props.onBlur(JSON.stringify(this.json, null, 4))
                }}/>
            </ListItemText></ListItem>
        }
    }

    setChildComponent(key, value, prop) {
        const o = Util.getComponentByKey(key, this.json)
        if (o) {
            o[prop || 'c'] = value
            this.props.onChange(JSON.stringify(this.json, null, 4))
            this.forceUpdate()
        }
    }


    addComponent(key) {
        const o = Util.getComponentByKey(key, this.json)
        if (o) {
            let c = o['c']
            if (!c) {
                c = []
            } else if (c.constructor === Object) {
                c = [c]
            } else if (c.constructor === String) {
                c = [{c}]
            }
            c.push({'c': 'new component'})
            o.c = c
            this.props.onBlur(JSON.stringify(this.json, null, 4))
            this.setState({open: Object.assign({}, this.state.open, {[key]: true})});

        }
    }


    removeComponent(key) {
        const parentKey = key.substring(0, key.lastIndexOf('.'))
        const parent = Util.getComponentByKey(parentKey, this.json), child = Util.getComponentByKey(key, this.json)
        if (parent && child) {
            let c = parent['c']
            if (!c) {
                return
            } else if (c.constructor !== Array) {
                c = ''
            } else {
                c.splice(c.indexOf(child), 1);
            }

            if (c.constructor === Array && c.length === 0) {
                c = '';
            }

            parent.c = c
            this.props.onBlur(JSON.stringify(this.json, null, 4))
            this.setState({open: Object.assign({}, this.state.open, {[key]: true})});

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