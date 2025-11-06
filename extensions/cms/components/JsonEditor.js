import React from 'react'
import PropTypes from 'prop-types'
import {
    List,
    ListItem,
    ListItemText,
    Collapse,
    ExpandLessIcon,
    ExpandMoreIcon,
    ClearIconButton,
    SimpleMenu
} from 'ui/admin'
import {getComponentByKey, addComponent, removeComponent} from '../util/jsonDomUtil'
import {_t} from '../../../util/i18n.mjs'
import styled from '@emotion/styled'
import {parseOrElse} from "../../../client/util/json.mjs";

const INDENT = 30


const StyledDropArea = styled('div')(({theme}) => ({
    textAlign: 'center',
    padding: '0.2rem',
    width: '100%',
    margin: '0 0 -' + theme.spacing(1) + ' 0',
    opacity: '0',
    fontSize: '0.8rem',
    backgroundColor: 'rgba(255,0,0,0.3)'
}))


const getIndexOfKey = (key)=> {
    const keyParts = key.split('.')
    return parseInt(keyParts[keyParts.length - 1])
}
const getParentKeyOfKey = (key)=> {
    return key.split('.').slice(0,-1).join('.')
}

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
                    json: nextProps.children && nextProps.children.constructor === String ? JSON.parse(nextProps.children) : nextProps.children
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

            let compTemp = this.props.componentTemplate || []
            if(compTemp.constructor===Object){
                //fallback for old structure
                compTemp = [{label:_t('JsonEditor.addEntry'),value:compTemp}]
            }
            if(compTemp.length===0){
                compTemp.push({label:_t('JsonEditor.addEntry')})
            }

            return <List component="nav">
                <SimpleMenu mini color="secondary" items={compTemp.map(el=>{
                    return {
                        name: el.label, onClick: e => {
                            this.addComponent(key, el.value)
                            return this.stopPropagation(e)
                        }
                    }
                })}/>{acc}</List>
        } else if (json.constructor === Object) {



            let propTemp = this.props.propertyTemplate || []

            if(propTemp.length===0){
                propTemp.push({label:_t('JsonEditor.addProperty'), key:'newProperty', value:'Property value'})
            }

            const actions = [
                ...propTemp.map(el=>{
                    return {
                        name: el.label, onClick: e => {
                            const comp = getComponentByKey(key, this.state.json)
                            if(!comp[el.key]) {
                                comp[el.key] = el.value
                                this.updateJson(this.state.json)
                            }
                            return this.stopPropagation(e)
                        }
                    }
                }),
                {
                    name: _t('JsonEditor.remove'), onClick: e => {
                        this.removeComponent(key)
                        return this.stopPropagation(e)
                    }
                }
            ]


            let itemLabel = ''
            const props = []
            Object.keys(json).forEach(k => {
                let value = json[k] || '', valueOri = json[k]
                if (!itemLabel) {
                    if(value._localized) {
                        itemLabel += _t(value)
                    }else if(value.constructor === String){
                        itemLabel += value
                    }
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
                    {
                        value.constructor === Array ? <td>{this.renderJsonRec(value,  key+'.'+k, level + 1)}</td> :
                            <td style={{width: '100%', whiteSpace: 'pre', background: '#dbffde'}}
                            suppressContentEditableWarning={true}
                            contentEditable
                            onBlur={(e) => {
                                let newValue = e.target.innerText.trim()
                                const comp = getComponentByKey(key, this.state.json)
                                comp[k] = parseOrElse(newValue)
                                this.updateJson(this.state.json)
                            }}>{value.constructor===String?value:JSON.stringify(value, null, 2)}</td>
                    }
                    <td><ClearIconButton onClick={() => {
                    const comp = getComponentByKey(key, this.state.json)
                    delete comp[k]
                    this.updateJson(this.state.json)}}/></td>

                </tr>)
            })

            const DropArea = ({position})=>{
                return <StyledDropArea key={`drop${key}${position}`}
                                data-key={key}
                                onDrop={(e) => {
                                    e.target.style.opacity = 0

                                    const targetKey = e.currentTarget.getAttribute('data-key'),
                                        sourceKey = e.dataTransfer.getData("text"),
                                        targetIndex = getIndexOfKey(targetKey) + (position==='after'?1:0),
                                        sourceIndex = getIndexOfKey(sourceKey)

                                    const targetComp = getComponentByKey(getParentKeyOfKey(targetKey), this.state.json),
                                        sourceComp = getComponentByKey(getParentKeyOfKey(sourceKey), this.state.json)

                                    if(targetComp == sourceComp){
                                        const element = sourceComp.splice(sourceIndex, 1) [0]
                                        sourceComp.splice(targetIndex > sourceIndex ? targetIndex - 1 : targetIndex, 0, element)
                                        this.updateJson(this.state.json)

                                    }else{
                                        alert('action not supported')
                                    }

                                }}
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    e.dataTransfer.dropEffect = 'copy'
                                    e.target.style.opacity = 1
                                }}
                                onDragLeave={(e) => {
                                    e.target.style.opacity = 0
                                }}>Hier einfügen</StyledDropArea>
            }


            return [
                getIndexOfKey(key)===0?<DropArea />:null,
                <ListItem dense
                          draggable
                          disableRipple
                          draggable={true}
                          data-key={key}
                          onDragStart={(e) => {
                              e.dataTransfer.setData('text', e.target.getAttribute('data-key'));
                          }}
                          key={key}
                          style={{paddingLeft: INDENT * level}}
                          button
                          onClick={this.handleClick.bind(this, key)}>

                    {actions && <SimpleMenu mini color="secondary" items={actions}/>}
                    <ListItemText style={{fontWeight: 'bold'}}>
                        {itemLabel}
                    </ListItemText>
                    {(json.c !== undefined || props.length > 0) && (!!this.state.open[key] ? <ExpandLessIcon/> :
                        <ExpandMoreIcon/>)}
                </ListItem>,
                <Collapse key={key + '.colapse'} in={!!this.state.open[key]} timeout="auto" unmountOnExit>
                    <div style={{paddingLeft: INDENT * level + 50}}>
                        <table colspstyle={{width: '100%', fontSize: '0.9em'}}>
                            <tbody>{props}</tbody>
                        </table>
                    </div>
                    {['input', 'textarea'].indexOf(itemLabel) < 0 || json.c ? this.renderJsonRec(json.c, key, level) :
                        <ListItem style={{paddingLeft: INDENT * level + 45}}
                                  key={key + '.c'}>Type {itemLabel} can not have
                            children</ListItem>}
                </Collapse>,
                <DropArea position="after"/>
            ]
        } else {
            /* return <ListItem style={{paddingLeft: INDENT * level + 65}} key={key + '.c'}><ListItemText>
                 <TextField placeholder="Enter some content" fullWidth value={json}
                            onChange={e => {this.updateJson(key, e.target.value, 'c')}}/>
             </ListItemText></ListItem>*/
        }
    }

    updateJson(json, dontUpdate) {
        this.props.onChange(json)
        if (!dontUpdate) {
            this.forceUpdate()
        }
    }

    stopPropagation(e) {
        e.stopPropagation()
        return false
    }

    addComponent(key, component) {
        const json = addComponent({key, json: this.state.json, component})
        if (json) {
            this.updateJson(this.state.json)
            this.setState({open: Object.assign({}, this.state.open, {[key]: true})});
        }
    }


    removeComponent(key) {
        if (removeComponent(key, this.state.json)) {
            this.updateJson(this.state.json)
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
