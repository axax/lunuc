import React from 'react'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {Typography,ExpansionPanel} from 'ui/admin'


class SystemContainer extends React.Component {


    render() {
        return <BaseLayout>
            <Typography type="display4" gutterBottom>Extensions</Typography>
            {
                Object.keys(extensions).map(k => {
                    const value = extensions[k]

                    return <ExpansionPanel heading={<Typography type="headline">{value.name}</Typography>} key={k}>
                        <div><Typography type="body1" gutterBottom>{value.description}</Typography></div>
                        <Typography type="caption" gutterBottom>Types</Typography>
                    </ExpansionPanel>
                })
            }
        </BaseLayout>
    }
}


export default SystemContainer
