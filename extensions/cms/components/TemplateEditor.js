import React from 'react'
import PropTypes from 'prop-types'
import JsonDomEditor from './JsonDomEditor'
import {Tabs, Tab, CodeIcon, WebIcon, SubjectIcon} from 'ui/admin'
import {getComponentByKey} from '../util/jsonDomUtil'
import {jsonPropertyTemplates, jsonTemplates} from './templates/template'
import Async from '../../../client/components/Async'
import styled from '@emotion/styled'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>



const StyledTabs = styled(Tabs)(({is50Percentage }) => ({
    borderBottom: '1px solid #e8e8e8',
    '.MuiTabs-indicator': {
        width: '33.33% !important',
        backgroundColor: '#1890ff',
        ...(is50Percentage && {
            width: '50% !important',
        })
    }
}))
const StyledTab = styled(Tab)(({ theme , isSelected }) => ({
    textTransform: 'initial',
    minWidth: 72,
    maxWidth: '100%',
    fontWeight: theme.typography.fontWeightRegular,
    marginRight: theme.spacing(4),
    fontFamily: [
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
        '"Apple Color Emoji"',
        '"Segoe UI Emoji"',
        '"Segoe UI Symbol"',
    ].join(','),
    '&:hover': {
        color: '#40a9ff',
        opacity: 1,
    },
    '&:focus': {
        color: '#40a9ff',
    },
    ...(isSelected && {
        color: '#1890ff',
        fontWeight: theme.typography.fontWeightMedium,
    })
}))


function TabContainer(props) {
    return (
        <div className={props.className}>
            {props.children}
        </div>
    )
}


class TemplateEditor extends React.Component {

    constructor(props) {
        super(props)

        this.state = TemplateEditor.getStateFromProps(props)
    }

    static getStateFromProps(props) {

        const {component, children} = props

        let data, type = 'json'
        if (!component) {
            if (children) {
                data = children.trim()
                if (data.indexOf('<') === 0) {
                    type = 'html'
                }
            } else {
                data = ''
            }
        } else {
            const {json, key} = component
            if (key) {
                const jsonPart = getComponentByKey(key, json)
                data = JSON.stringify(jsonPart, null, 2)
            }
        }


        return {
            data,
            type,
            children: props.children,
            component: props.component,
            tab: props.tab || 0
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.children !== prevState.children ||
            nextProps.component !== prevState.component) {
            return TemplateEditor.getStateFromProps(nextProps)
        }
        return null
    }


    shouldComponentUpdate(props, state) {

        return state.data !== this.state.data ||
            state.tab !== this.state.tab ||
            state.error !== this.state.error
    }

    render() {
        const {component, fabButtonStyle, onScroll, scrollPosition, identifier} = this.props
        const {data, type, error} = this.state
        const currentTab = (!component && this.state.tab === 2 ? 0 : this.state.tab) || 0

        return <>
            <StyledTabs
                value={currentTab}
                onChange={this.handleTabChange.bind(this)}
                variant="fullWidth"
                indicatorColor="primary"
                textColor="primary"
                is50Percentage={component ? false : true}
            >
                <StyledTab icon={<CodeIcon/>}/>
                {type === 'json' &&
                <StyledTab icon={<WebIcon/>}/>}
                {component &&
                <StyledTab icon={<SubjectIcon/>}/>}
            </StyledTabs>
            {currentTab === 0 && <TabContainer>
                <CodeEditor onScroll={onScroll}
                            scrollPosition={scrollPosition}
                            fabButtonStyle={fabButtonStyle}
                            onChange={this.handleChange.bind(this)}
                            error={error}
                            identifier={identifier}
                            templates={jsonTemplates}
                            propertyTemplates={jsonPropertyTemplates}
                            onError={(e, data)=>{
                                if (data.trim().indexOf('<') === 0) {
                                    // content changed to html
                                    this.handleChange(data)
                                }
                            }}
                            showFab
                            lineNumbers
                            type={type}>{data}</CodeEditor>

            </TabContainer>}
            {currentTab === 1 && <TabContainer>
                <JsonDomEditor onChange={this.handleChange.bind(this)}>{data}</JsonDomEditor>
            </TabContainer>}
            {component && currentTab === 2 && <TabContainer>
                <CodeEditor showFab fabButtonStyle={fabButtonStyle} lineNumbers type="json" readOnly>
                    {JSON.stringify(component.scope, (key, val) => {
                        if (['root', 'parent'].indexOf(key) >= 0) {
                            return '[JsonDom]'
                        }
                        return val
                    }, 4)}
                </CodeEditor>
            </TabContainer>}

        </>
    }

    handleChange(str, instantSave) {
        const {onChange, component} = this.props

        this.setState({data: str, error: false})

        let data, type = 'json'
        if (!component) {
            onChange(str)
        } else {
            const {json, key} = component
            if (!key) {
                return null
            }
            const jsonPart = getComponentByKey(key, json)
            if (jsonPart) {
                // empty object but keep reference
                for (const key in jsonPart) {
                    delete jsonPart[key]
                }
                // set property of new object to existing reference
                try {
                    Object.assign(jsonPart, JSON.parse(str))

                    onChange(json)
                } catch (e) {
                    this.setState({error: `Fehler in der JSON Struktur: ${e.message}`})
                    console.log('Error in json', str)
                    return false
                }
            }
        }
    }

    handleTabChange(event, tab) {
        this.setState({tab})
        this.props.onTabChange(tab)
    }
}

TemplateEditor.propTypes = {
    component: PropTypes.object,
    onTabChange: PropTypes.func.isRequired,
    onChange: PropTypes.func.isRequired,
    fabButtonStyle: PropTypes.object,
    tab: PropTypes.any
}

export default TemplateEditor

