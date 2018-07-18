import React from 'react'
import PropTypes from 'prop-types'
import ContentEditable from '../generic/ContentEditable'
import JsonEditor from '../generic/JsonEditor'
import {SimpleMenu, Tabs, Tab, CodeIcon, WebIcon, withStyles} from 'ui/admin'


const styles = theme => ({
    root: {
        flexGrow: 1,
        backgroundColor: theme.palette.background.paper,
    },
    tabsRoot: {
        borderBottom: '1px solid #e8e8e8',
    },
    tabsIndicator: {
        width:'50% !important',
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
            tab:props.tab || 0
        }
    }

    componentWillReceiveProps(props){
        if( props.tab !== this.state.tab ){
            this.setState({tab:props.tab})
        }
    }

    render() {
        const {tab,classes,...rest} = this.props
        return <div style={{position: 'relative'}}>

            <Tabs
                value={this.state.tab}
                onChange={this.handleTabChange.bind(this)}
                fullWidth
                indicatorColor="primary"
                textColor="primary"
                classes={{ root: classes.tabsRoot, indicator: classes.tabsIndicator }}
            >
                <Tab icon={<CodeIcon />} classes={{ root: classes.tabRoot, selected: classes.tabSelected }}/>
                <Tab icon={<WebIcon />} classes={{ root: classes.tabRoot, selected: classes.tabSelected }}/>
            </Tabs>
            {this.state.tab === 0 && <TabContainer>

                <SimpleMenu mini fab color="secondary" style={{position: 'absolute', bottom: '-8px', right: '-8px'}}
                            items={[{name: 'Prettify', onClick: this.prettify.bind(this)}]}/>
                <ContentEditable highlight="json" setHtml={false} {...rest}/>

            </TabContainer>}
            {this.state.tab === 1 && <TabContainer>
                <JsonEditor {...rest}/>
            </TabContainer>}

        </div>
    }

    handleTabChange(event, tab){
        const {onTabChange} = this.props
        this.setState({ tab })
        if( onTabChange ){
            onTabChange(tab)
        }
    }

    prettify() {
        const {onBlur, children} = this.props
        if (children.trim() === '') return

        try {
            const j = eval('(' + children + ')');
            if (j.constructor === Array || j.constructor === Object) {
                onBlur(JSON.stringify(j, null, 2))
            }
        } catch (e) {
            console.error(e)
        }
    }
}

TemplateEditor.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(TemplateEditor)

