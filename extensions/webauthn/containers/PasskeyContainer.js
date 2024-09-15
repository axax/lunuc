import React from 'react'
import {
    Typography,
    FingerprintIcon,
    Button,
} from 'ui/admin'
import {registerWebAuthn} from '../util/navigator.mjs'
import TypesContainer from '../../../client/containers/TypesContainer'
import {_t} from '../../../util/i18n.mjs'

class PasskeyContainer extends React.Component {
    constructor(props) {
        super(props)
    }
    render() {

        const {history, location, match} = this.props

        return <>
            <Typography variant="h3" gutterBottom>Passkey</Typography>

            <Button sx={{mb:4}} variant="contained" endIcon={<FingerprintIcon />}
            onClick={registerWebAuthn}>
                {_t('PasskeyContainer.createNewPasskey')}
            </Button>

            <TypesContainer baseUrl={location.pathname}
                            title={false}
                            fixType="WebAuthnCredential"
                            history={history} location={location} match={match}/>
            </>
    }

}



export default PasskeyContainer