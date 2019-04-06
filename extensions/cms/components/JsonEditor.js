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
import JsonDomUtil from '../util/jsonDomUtil'

const styles = theme => ({
    type: {
        fontWeight: 'bold'
    }
})
import JsonDom from './JsonDom'

class JsonEditor extends React.Component {

    static components = null

    constructor(props) {
        super(props)

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

        this.state = {
            dataOri: props.children,
            open: {}
        }

        if( props.children ) {
            try {
                this.state.json = JSON.parse(props.children)
            } catch (e) {
                console.log(e, props.children)
            }
        }

    }

    static getDerivedStateFromProps(nextProps, prevState) {

        if (nextProps.children !== prevState.dataOri) {
            try {
                return {
                    dataOri: nextProps.children,
                    json: nextProps.children ? JSON.parse(nextProps.children) : null
                }
            } catch (e) {
                console.log(e, nextProps.children)
            }
        }
        return null
    }

    renderJsonRec(json, key, level) {
        if( !json ) return null
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

            let newkey = key, newlevel = level
            if (json.c && json.c.constructor === Object) {
                newkey += '.0'
                newlevel++
            }

            let specialType, actions
            if( json.$loop ){
                json = json.$loop
                specialType = '$loop'
                newkey += '.$loop.0'
                newlevel++
            }else{
                actions = [{
                    name: 'Add child component', onClick: e => {
                        this.addComponent(key)
                        return this.stopPropagation(e)
                    }
                }, {
                    name: 'Remove this component', onClick: e => {
                        this.removeComponent(key)
                        return this.stopPropagation(e)
                    }
                }]
            }

            const t = (specialType || json.t || 'div')
            const props = []
            Object.keys(json).forEach(k => {
                if (k !== 't' && k !== 'c') {
                    props.push(<ListItem style={{paddingLeft: 10 * level + 10}}
                                         key={key + '.' + k}><ListItemText>{k + ' = ' + JSON.stringify(json[k])}</ListItemText></ListItem>)
                }
            })


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

                {actions && <SimpleMenu mini color="secondary" items={actions}/>}
                <ListItemText classes={{primary: classes.type}}>

                    {specialType ? t :
                    <SimpleAutosuggest placeholder="Enter component type" value={t}
                                       onChange={(e, v) => {
                                           this.setChildComponent(key, v, 't')
                                       }
                                       }
                                       onBlur={this.handleBlur.bind(this)}
                                       onClick={this.stopPropagation} items={JsonEditor.components}/>}
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
                } onBlur={this.handleBlur.bind(this)}/>
            </ListItemText></ListItem>
        }
    }

    setChildComponent(key, value, prop) {
        const o = JsonDomUtil.getComponentByKey(key, this.state.json)
        if (o) {
            o[prop || 'c'] = value
            this.props.onChange(JSON.stringify(this.state.json, null, 4))
            this.forceUpdate()
        }
    }

    stopPropagation(e) {
        e.stopPropagation()
        return false
    }


    handleBlur() {
        const {onChange} = this.props
        if (onChange) {
            onChange(JSON.stringify(this.state.json, null, 4),true)
        }
    }


    addComponent(key) {
        const json = JsonDomUtil.addComponent({key, json: this.state.json})
        if (json) {
            this.props.onChange(JSON.stringify(this.state.json, null, 4), true)
            this.setState({open: Object.assign({}, this.state.open, {[key]: true})});
        }
    }


    removeComponent(key) {
        const parentKey = key.substring(0, key.lastIndexOf('.'))
        const parent = JsonDomUtil.getComponentByKey(parentKey, this.state.json),
            child = JsonDomUtil.getComponentByKey(key, this.state.json)
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
            this.props.onChange(JSON.stringify(this.state.json, null, 4), true)
            this.setState({open: Object.assign({}, this.state.open, {[key]: true})});

        }
    }

    handleClick(key) {
        this.setState({open: Object.assign({}, this.state.open, {[key]: !this.state.open[key]})});
    }

    render() {
        return this.renderJsonRec(this.state.json)
    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextState.open !== this.state.open || nextProps.children != this.props.children
    }

}

JsonEditor.propTypes = {
    style: PropTypes.object,
    onChange: PropTypes.func,
    classes: PropTypes.object.isRequired,
}

export default withStyles(styles)(JsonEditor)