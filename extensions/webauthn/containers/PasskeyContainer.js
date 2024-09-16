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
            onClick={async ()=>{
                const result = await registerWebAuthn()
                if(result.error) {
                    alert(result.error)
                }else {
                    this.typeContainer.getData(this.typeContainer.pageParams, false)
                }
            }}>
                {_t('PasskeyContainer.createNewPasskey')}
            </Button>

            <TypesContainer onRef={ref => (this.typeContainer = ref)}
                            baseUrl={location.pathname}
                            title={false}
                            fixType="WebAuthnCredential"
                            history={history} location={location} match={match}/>
            </>
    }

}



export default PasskeyContainer