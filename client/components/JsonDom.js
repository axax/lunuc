import React from 'react'
import PropTypes from 'prop-types'
import ContentEditable from '../components/generic/ContentEditable'
import {DrawerLayout, Button, MenuList, MenuListItem, Divider, Col, Row, Textarea, Toolbar, Card} from 'ui'
import Hook from 'util/hook'
import Util from 'client/util'

class JsonDom extends React.Component {

    components = {
        'Toolbar': ({position, ...rest}) => <Toolbar
            position={(this.props.editMode ? 'static' : position)} {...rest} />,
        'Button': Button,
        'Divider': Divider,
        'Card': Card,
        'Col': Col,
        'Row': Row,
        'h1$': ({id, ...rest}) => <h1><ContentEditable onChange={(v) => this.emitChange(id, v)}
                                                       onBlur={(v) => this.emitChange(id, v, true)} {...rest} /></h1>,
        'h2$': ({id, ...rest}) => <h2><ContentEditable onChange={(v) => this.emitChange(id, v)}
                                                       onBlur={(v) => this.emitChange(id, v, true)} {...rest} /></h2>,
        'p$': ({id, ...rest}) => <p><ContentEditable onChange={(v) => this.emitChange(id, v)}
                                                     onBlur={(v) => this.emitChange(id, v, true)} {...rest} /></p>
    }

    json = null
    jsonRaw = null
    scope = null
    parseError = null


    constructor(props) {
        super(props)
        this.state = {hasReactError: false}

        Hook.call('JsonDom', {components: this.components})
    }


    componentDidCatch() {
        this.setState({hasReactError: true})
    }

    componentWillReceiveProps(props) {
        if (this.props.template != props.template || this.props.scope != props.scope) {
            // reset parsed json contents
            this.json = null
            this.jsonRaw = null
            this.scope = null
            console.log('reset')
        }
        this.setState({hasReactError: false})
    }

    shouldComponentUpdate(props, state) {
        if (state.hasReactError) return true

        console.log('update')
        if (!props.template || !props.scope) return true

        return this.props.template != props.template || this.props.scope != props.scope
    }

    emitChange(id, v, save) {
        const {onChange} = this.props

        if (!onChange)
            return

        var jsonClone = this.getJsonRaw(this.props)
        const ids = id.split('.')
        ids.shift()

        let cur = jsonClone
        ids.forEach((i) => {
            if (cur.c) {
                cur = cur.c[i]
            } else {
                cur = cur[i]
            }
        })
        cur.c = v

        onChange(jsonClone, save)
    }


    emitJsonError(e) {
        const {onError} = this.props

        this.parseError = e

        if (!onError)
            return

        onError(e)
    }

    scopeByPath(path) {
        try {
            // get data from scope by path (foo.bar)
            return path.split('.').reduce((res, prop) => res[prop], this.scope)
        } catch (e) {
            this.emitJsonError(e)
        }
    }

    parseRec(a, rootKey) {
        if (!a) return null
        if (a.constructor === String) return a
        if (a.constructor !== Array) return ''
        let h = []
        a.forEach(({t, p, c, $loop}, i) => {
            /*
             t = type
             c = children
             p = props
             */
            if ($loop) {
                const {$d, d, c} = $loop
                let data
                if ($d) {
                    data = this.scopeByPath($d)
                } else {
                    data = d
                }
                if (!data || data.constructor !== Array) return ''

                let {s} = $loop
                if (!s) s = 'loop'
                /*
                 d = data in loop
                 $d = data (json as string) in loop
                 c = children in loop
                 s = scope in loop to access data
                 */
                try {
                    const re = new RegExp('\\$\\.' + s + '{', 'g')
                    const cStr = JSON.stringify(c).replace(re, '${').replace(/\${(?!this\.)/g, '${this.' + s + '.')


                    data.forEach((loopChild, j) => {
                        const tpl = new Function('return `' + cStr + '`;')
                        // back to json
                        const json = JSON.parse(tpl.call({[s]: loopChild}))

                        const key = rootKey + '.' + i + '.$loop.' + j
                        h.push(this.parseRec(json, key))


                    })
                } catch (ex) {
                    return ex.message
                }


            }
            const key = rootKey + '.' + i
            let _t
            if (!t) {
                _t = 'div'
            } else if (!this.props.editMode && t.slice(-1) === '$') {
                _t = t.slice(0, -1) // remove last char
            } else {
                _t = t
            }
            if (p && p.onClick) {
                const clickData = p.onClick
                p.onClick = () => {
                    console.log(clickData)
                }
            }
            h.push(React.createElement(
                this.components[_t] || _t,
                {id: key, key, ...p},
                this.parseRec(c, key)
            ))
        })
        return h
    }

    getScope(props) {
        if (this.scope) return this.scope
        const {scope} = props
        this.scope = JSON.parse(scope)
        return this.scope
    }

    getJson(props) {
        if (this.json) return this.json
        const {template} = props
        const scope = this.getScope(props)
        try {
            /*
             json is the modified version for viewing (placeholder are replaced)
             */
            this.json = JSON.parse(this.renderString(template, scope))
        } catch (e) {
            this.emitJsonError(e)
        }
        return this.json
    }

    getJsonRaw(props) {
        if (this.jsonRaw) return this.jsonRaw
        const {template} = props
        try {
            /*
             jsonRaw is the unmodified json for editing
             */
            this.jsonRaw = JSON.parse(template)
        } catch (e) {
            this.emitJsonError(e)
        }
        return this.jsonRaw
    }


    renderString(str, data) {
        try {
            const tpl = new Function('return `' + str.replace(/\${(?!this\.)/g, '${this.') + '`;')
            return tpl.call(data)
        } catch (e) {
            //this.emitJsonError(e)

            return str
        }
    }

    componentWillUpdate(props) {
        this.parseError = null
    }

    render() {
        const {template} = this.props
        if (!template)
            return null

        console.log('render JsonDom')
        const {hasReactError} = this.state

        if (hasReactError) {
            return <strong>There is something wrong with one of the components defined in the json content. See
                console.log in the browser for more detail.</strong>
        }

        const start = (new Date()).getTime()
        const content = this.parseRec(this.getJson(this.props), 0)
        console.log(`render JsonDom in ${((new Date()).getTime() - start)}ms`)

        if (this.parseError) {
            return <div>Error in the json content: <strong>{this.parseError.message}</strong></div>
        } else {
            return content
        }

    }

}

JsonDom.propTypes = {
    template: PropTypes.string,
    scope: PropTypes.string,
    onChange: PropTypes.func,
    onError: PropTypes.func
}

export default JsonDom
