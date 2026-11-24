import React from 'react'
import MaterialCard from '@mui/material/Card'
import MaterialCardContent from '@mui/material/CardContent'

// own file, so it can be loaded without the whole ui (see uiBase.js)
const Card = ({children, ...rest}) => {
    return <MaterialCard {...rest}>
        <MaterialCardContent>
            {children}
        </MaterialCardContent>
    </MaterialCard>
}

export default Card
