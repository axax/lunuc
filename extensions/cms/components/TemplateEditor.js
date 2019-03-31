import React from 'react'
import PropTypes from 'prop-types'
import CodeEditor from 'client/components/CodeEditor'
import JsonEditor from './JsonEditor'
import {SimpleMenu, Tabs, Tab, CodeIcon, WebIcon, SubjectIcon, withStyles} from 'ui/admin'


const styles = theme => ({
    root: {
        flexGrow: 1,
        backgroundColor: theme.palette.background.paper,
    },
    tabsRoot: {
        borderBottom: '1px solid #e8e8e8',
    },
    tabsIndicator: {
        width: '33.33% !important',
        backgroundColor: '#1890ff',
    },
    tabsIndicator50: {
        width: '50% !important',
        backgroundColor: '#1890ff',
    },
    tabRoot: {
        textTransform: 'initial',
        minWidth: 72,
        maxWidth: '100%',
        fontWeight: theme.typography.fontWeightRegular,
        marginRight: theme.spacing.unit * 4,
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
        '&$tabSelected': {
            color: '#1890ff',
            fontWeight: theme.typography.fontWeightMedium,
        },
        '&:focus': {
            color: '#40a9ff',
        },
    },
    tabSelected: {},
    typography: {
        padding: theme.spacing.unit * 3,
    },
})


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

        this.state = {
            tab: props.tab || 0
        }
    }

    componentWillReceiveProps(props) {
        if (props.tab !== this.state.tab) {
            this.setState({tab: props.tab})
        }
    }

    render() {
        const {tab, classes, scope, ...rest} = this.props

        const type = (rest.children && rest.children.trim().indexOf('<') === 0 )? 'html' : 'json'
        const currentTab = (!scope && this.state.tab === 2 ? 0 : this.state.tab) || 0
        return <div style={{position: 'relative'}}>
            <Tabs
                value={currentTab}
                onChange={this.handleTabChange.bind(this)}
                variant="fullWidth"
                indicatorColor="primary"
                textColor="primary"
                classes={{
                    root: classes.tabsRoot,
                    indicator: (scope ? classes.tabsIndicator : classes.tabsIndicator50)
                }}
            >
                <Tab icon={<CodeIcon />} classes={{root: classes.tabRoot, selected: classes.tabSelected}}/>
                {type==='json' && <Tab icon={<WebIcon />} classes={{root: classes.tabRoot, selected: classes.tabSelected}}/>}
                {scope &&
                <Tab icon={<SubjectIcon />} classes={{root: classes.tabRoot, selected: classes.tabSelected}}/>}
            </Tabs>
            {currentTab === 0 && <TabContainer>

                {type==='json' && <SimpleMenu mini fab color="secondary" style={{zIndex:999,position: 'absolute', bottom: '-8px', right: '-8px'}}
                            items={[{name: 'Prettify', onClick: this.prettify.bind(this)}]}/>}
                <CodeEditor lineNumbers type={type} {...rest}/>

            </TabContainer>}
            {currentTab === 1 && <TabContainer>
                <JsonEditor {...rest}/>
            </TabContainer>}
            {scope && currentTab === 2 && <TabContainer>
                <CodeEditor lineNumbers type="json" readOnly>
                {JSON.stringify(scope, null, 4)}
                </CodeEditor>
            </TabContainer>}

        </div>
    }

    handleTabChange(event, tab) {
        const {onTabChange} = this.props
        this.setState({tab})
        if (onTabChange) {
            onTabChange(tab)
        }
    }

    prettify() {
        const {onChange, children} = this.props
        if (children.trim() === '') return
        try {
            const j = eval('(' + children + ')');
            if (j.constructor === Array || j.constructor === Object) {
                onChange(JSON.stringify(j, null, 4), true)
            }
        } catch (e) {
            console.error(e)
        }
    }
}

TemplateEditor.propTypes = {
    scope: PropTypes.object,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(TemplateEditor)

