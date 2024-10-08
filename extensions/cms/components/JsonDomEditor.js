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

                this.state.json = props.children

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
                    json: nextProps.children ? JSON.parse(nextProps.children) : nextProps.children
                }
            } catch (e) {
                console.log(e, nextProps.children)
            }
        }
        return null
    }

    renderJsonRec(json, key, level=0) {
        if (json === undefined) return null
        if (!key) {
            key = '0'
            if (json.constructor !== Array) {
                key += '.0'
            }
        }

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
            if (json.$loop) {
                json = json.$loop
                specialType = '$loop'
                newkey += '.$loop.0'
                newlevel++
            } else {
                actions = [
                    {
                        name: 'Add child component', onClick: e => {
                            this.addComponent(key)
                            return this.stopPropagation(e)
                        }
                    },
                    {
                        name: 'Add property', onClick: e => {

                            const comp = getComponentByKey(key, this.state.json)
                            const prop = Object.assign({}, comp.p, {'newProperty': 'Property value'})
                            this.setComponentProperty(key, prop, 'p')
                            return this.stopPropagation(e)
                        }
                    },
                    {
                        name: 'Remove this component', onClick: e => {
                            this.removeComponent(key)
                            return this.stopPropagation(e)
                        }
                    }
                ]

                if (json.t === 'Cms') {
                    actions.push({
                        name: 'Edit this component', onClick: e => {
                            window.location = '/' + json.p.slug
                        }
                    })
                }
            }

            const t = (specialType || json.t || 'div')
            const props = []
            if (json.p) {
                Object.keys(json.p).forEach(k => {
                    let value = json.p[k], valueOri = json.p[k]

                    if (value && value.constructor !== String) {
                        value = JSON.stringify(value, null, 2)
                    }
                    props.push(<tr key={key + '.p.' + k}>
                        <td style={{fontWeight: 'bold', background: '#ffdbfb'}}
                            suppressContentEditableWarning={true}
                            contentEditable
                            onBlur={(e) => {
                                const comp = getComponentByKey(key, this.state.json)
                                const prop = Object.assign({}, comp.p)

                                const newKey = e.target.innerText.trim()
                                if (k !== newKey && !prop[newKey]) {
                                    delete prop[k]
                                    prop[newKey] = valueOri
                                    this.setComponentProperty(key, prop, 'p')
                                }
                            }}>{k}</td>
                        <td style={{width: '100%', whiteSpace: 'pre', background: '#dbffde'}}
                            suppressContentEditableWarning={true}
                            contentEditable
                            onBlur={(e) => {
                                let newValue = e.target.innerText.trim()
                                if (newValue.startsWith('{') && newValue.endsWith('}')) {
                                    try {
                                        newValue = eval('(' + newValue + ')')
                                    } catch (e) {
                                    }
                                }
                                const comp = getComponentByKey(key, this.state.json)
                                const prop = Object.assign({}, comp.p)
                                prop[k] = newValue
                                this.setComponentProperty(key, prop, 'p')
                            }}>{value}</td>
                        <td><ClearIconButton onClick={() => {
                            const comp = getComponentByKey(key, this.state.json)
                            const prop = Object.assign({}, comp.p)
                            delete prop[k]
                            this.setComponentProperty(key, prop, 'p')
                        }}/></td>
                    </tr>)
                })
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
            return [<ListItem dense
                              draggable
                              disableRipple
                              onMouseEnter={() => {
                                  const ele = document.querySelector(`[_key="${key}"]`)
                                  if (ele) {
                                      const pos = DomUtilAdmin.elemOffset(ele);
                                      DomUtil.createAndAddTag('div', 'body', {
                                          id: 'JsonEditorHighlighter',
                                          style: {
                                              display: 'block',
                                              position: 'absolute',
                                              background: 'rgba(0,0,0,0.1)',
                                              left: pos.left + 'px',
                                              top: (pos.top + window.scrollY) + 'px',
                                              height: ele.offsetHeight + 'px',
                                              width: ele.offsetWidth + 'px'
                                          }
                                      })
                                  }

                              }}
                              onMouseLeave={() => {
                                  DomUtil.createAndAddTag('div', 'body', {
                                      id: 'JsonEditorHighlighter',
                                      style: {display: 'none'}
                                  })
                              }}
                              key={key} style={{paddingLeft: INDENT * level}} button
                              onClick={this.handleClick.bind(this, key)}>

                {actions && <SimpleMenu mini color="secondary" items={actions}/>}
                <ListItemText sx={{primary:{fontWeight: 'bold'}}}>

                    {specialType ? t :
                        <SimpleAutosuggest placeholder="Enter component type"
                                           value={t}
                                           freeSolo
                                           onInputChange={(inputEvent, value) => {
                                               if(inputEvent) {
                                                   const option = getJsonDomElements().find(item=>item.name===value)
                                                   if(option){
                                                       this.setComponentProperty(key, option.value, 't')
                                                   }else{
                                                       this.setComponentProperty(key, value, 't')
                                                   }
                                               }
                                           }}
                                           onBlur={this.handleBlur.bind(this)}
                                           onClick={this.stopPropagation}
                                           options={getJsonDomElements()}/>}
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
                    {['input', 'textarea'].indexOf(t) < 0 || json.c ? this.renderJsonRec(json.c, newkey, newlevel) :
                        <ListItem style={{paddingLeft: INDENT * newlevel + 65}}
                                  key={key + '.c'}>Type {t} can not have
                            children</ListItem>}
                </Collapse>
            ]
        } else {
            return <ListItem style={{paddingLeft: INDENT * level + 65}} key={key + '.c'}><ListItemText>
                <TextField placeholder="Enter some content" fullWidth value={json} onChange={e => {
                    this.setComponentProperty(key, e.target.value, 'c')
                }
                } onBlur={this.handleBlur.bind(this)}/>
            </ListItemText></ListItem>
        }
    }

    setComponentProperty(key, value, prop, dontUpdate) {
        const o = getComponentByKey(key, this.state.json)
        if (o) {
            if (value === null) {
                delete o[prop]
            } else {
                o[prop] = value
            }
            this.props.onChange(JSON.stringify(this.state.json, null, 2))
            if (!dontUpdate)
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
