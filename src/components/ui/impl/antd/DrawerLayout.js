import React from 'react'
import { Layout, Menu, Icon } from 'antd';
const { Header, Sider, Content } = Layout;
import './DrawerLayout.less'

class DrawerLayout extends React.Component {
    state = {
        collapsed: false,
    }
    toggle = () => {
        this.setState({
            collapsed: !this.state.collapsed,
        })
    }
    render() {

        const { title, sidebar, children } = this.props;

        return (
            <Layout className="drawer-layout">
                <Sider
                    trigger={null}
                    collapsible
                    collapsed={this.state.collapsed}
                >
                    <div className="logo" />
                    {sidebar}
                </Sider>
                <Layout>
                    <Header style={{ background: '#fff', padding: 0 }}>
                        <Icon
                            className="trigger"
                            type={this.state.collapsed ? 'menu-unfold' : 'menu-fold'}
                            onClick={this.toggle}
                        />
                        {title}
                    </Header>
                    <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
                        {children}
                    </Content>
                </Layout>
            </Layout>
        )
    }
}

export default DrawerLayout