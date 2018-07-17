import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import JsonEditor from '../generic/JsonEditor'
import {SimpleMenu, Tabs, Tab, CodeIcon, WebIcon} from 'ui/admin'


function TabContainer(props) {
    return (
        <div>
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
        const {tab,...rest} = this.props
        return <div style={{position: 'relative'}}>

            <Tabs
                value={this.state.tab}
                onChange={this.handleTabChange.bind(this)}
                fullWidth
                indicatorColor="primary"
                textColor="primary"
            >
                <Tab icon={<CodeIcon />}/>
                <Tab icon={<WebIcon />}/>
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


export default TemplateEditor

