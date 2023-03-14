import React from 'react'
import PropTypes from 'prop-types'
import {
    List,
    ListItem,
    ListItemText,
    Collapse,
    ExpandLessIcon,
    ExpandMoreIcon,
    TextField,
    ClearIconButton,
    SimpleAutosuggest,
    SimpleMenu
} from 'ui/admin'
import {getComponentByKey, addComponent, removeComponent} from '../util/jsonDomUtil'
import DomUtil from 'client/util/dom.mjs'
import DomUtilAdmin from 'client/util/domAdmin.mjs'
import {getJsonDomElements} from '../util/elements'

const INDENT = 30


class JsonDomEditor extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            dataOri: props.children,
            open: JsonDomEditor.openState || {}
        }

        if (props.children) {

            if (props.children.constructor === String) {
                try {
                    this.state.json = JSON.parse(props.children)
                } catch (e) {
                    console.log(e, props.children)
                }
            } else {

                this.state.json = JSON.parse(JSON.stringify(props.children))

            }
        }
    }

    componentWillUnmount() {
        // keep latest state
        JsonDomEditor.openState = this.state.open
    }

    static getDerivedStateFromProps(nextProps, prevState) {

        if (nextProps.children !== prevState.dataOri) {
            try {
                return {
                    dataOri: nextProps.children,
                    json: nextProps.children && nextProps.children.constructor===String ? JSON.parse(nextProps.children) : nextProps.children
                }
            } catch (e) {
                console.log(e, nextProps.children)
            }
        }
        return null
    }

    renderJsonRec(json, key, level) {
        if (json === undefined) return null
        if (!key) {
            key = '0'
            if (json.constructor !== Array) {
                key += '.0'
            }
        }
        if (!level) level = 0

        if (json.constructor === Array) {
            const acc = []
            json.forEach((item, idx) => {
                acc.push(this.renderJsonRec(item, key + '.' + idx, level + 1))
            })
            return <List component="nav">
                <SimpleMenu mini color="secondary" items={[{
                    name: 'Add Entry', onClick: e => {
                        this.addComponent(key)
                        return this.stopPropagation(e)
                    }
                }]}/>{acc}</List>
        } else if (json.constructor === Object) {

            let newkey = key, newlevel = level


            const actions = [
                   /* {
                        name: 'Add child component', onClick: e => {
                            this.addComponent(key)
                            return this.stopPropagation(e)
                        }
                    },*/
                    {
                        name: 'Add property', onClick: e => {
                            const comp = getComponentByKey(key, this.state.json)
                            comp['newProperty'] = 'Property value'
                            this.updateJson(this.state.json)
                            return this.stopPropagation(e)
                        }
                    },
                    {
                        name: 'Remove', onClick: e => {
                            this.removeComponent(key)
                            return this.stopPropagation(e)
                        }
                    }
                ]


            let itemLabel =''
            const props = []
            Object.keys(json).forEach(k => {
                let value = json[k], valueOri = json[k]

                if (value && value.constructor !== String) {
                    value = JSON.stringify(value, null, 2)

                }else if(!itemLabel){
                    itemLabel += value
                }
                props.push(<tr key={key + '.' + k}>
                    <td style={{fontWeight: 'bold', background: '#ffdbfb'}}
                        suppressContentEditableWarning={true}
                        contentEditable
                        onBlur={(e) => {
                            const comp = getComponentByKey(key, this.state.json)

                            const newKey = e.target.innerText.trim()
                            if (k !== newKey && !comp[newKey]) {
                                delete comp[k]
                                comp[newKey] = valueOri
                                this.updateJson(this.state.json)
                            }
                        }}>{k}</td>
                    <td style={{width: '100%', whiteSpace: 'pre', background: '#dbffde'}}
                        suppressContentEditableWarning={true}
                        contentEditable
                        onBlur={(e) => {
                            let newValue = e.target.innerText.trim()
                            const comp = getComponentByKey(key, this.state.json)
                            comp[k] = newValue
                            this.updateJson(this.state.json)
                        }}>{value}</td>
                    <td><ClearIconButton onClick={() => {
                        const comp = getComponentByKey(key, this.state.json)
                        delete comp[k]
                        this.updateJson( this.state.json)
                    }}/></td>
                </tr>)
            })

            return [<ListItem dense
                              draggable
                              disableRipple
                              key={key} style={{paddingLeft: INDENT * level}} button
                              onClick={this.handleClick.bind(this, key)}>

                {actions && <SimpleMenu mini color="secondary" items={actions}/>}
                <ListItemText style={{fontWeight: 'bold'}}>
                    {itemLabel}
                </ListItemText>
                {(json.c !== undefined || props.length > 0) && (!!this.state.open[key] ? <ExpandLessIcon/> :
                    <ExpandMoreIcon/>)}
            </ListItem>,
                <Collapse key={key + '.colapse'} in={!!this.state.open[key]} timeout="auto" unmountOnExit>
                    <div style={{paddingLeft: INDENT * level + 65}}>
                        <table colspstyle={{width: '100%', fontSize: '0.9em'}}>
                            <tbody>{props}</tbody>
                        </table>
                    </div>
                    {['input', 'textarea'].indexOf(itemLabel) < 0 || json.c ? this.renderJsonRec(json.c, newkey, newlevel) :
                        <ListItem style={{paddingLeft: INDENT * newlevel + 65}}
                                  key={key + '.c'}>Type {itemLabel} can not have
                            children</ListItem>}
                </Collapse>
            ]
        } else {
            return <ListItem style={{paddingLeft: INDENT * level + 65}} key={key + '.c'}><ListItemText>
                <TextField placeholder="Enter some content" fullWidth value={json} onChange={e => {
                    this.updateJson(key, e.target.value, 'c')
                }
                } onBlur={this.handleBlur.bind(this)}/>
            </ListItemText></ListItem>
        }
    }

    updateJson(json, dontUpdate) {
        this.props.onChange(json)
        if (!dontUpdate){
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
            onChange(JSON.stringify(this.state.json, null, 2), true)
        }
    }


    addComponent(key) {
        const json = addComponent({key, json: this.state.json})
        if (json) {
            this.props.onChange(JSON.stringify(this.state.json, null, 2), true)
            this.setState({open: Object.assign({}, this.state.open, {[key]: true})});
        }
    }


    removeComponent(key) {
        if (removeComponent(key, this.state.json)) {
            this.props.onChange(JSON.stringify(this.state.json, null, 2), true)
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

JsonDomEditor.propTypes = {
    style: PropTypes.object,
    onChange: PropTypes.func
}

export default JsonDomEditor
