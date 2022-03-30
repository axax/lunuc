import React from 'react'
import styled from '@emotion/styled'

const StyledContentBlock = styled('div')(({ theme }) => ({
    marginBottom: theme.spacing(4)
}))

class ContentBlock extends React.PureComponent {
    render() {
        return <StyledContentBlock {...this.props} />
    }
}


export default ContentBlock

