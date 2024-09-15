import React from 'react'
import Hook from '../../util/hook.cjs'
import {registerTrs,_t} from '../../util/i18n.mjs'
import {translations} from './translations/admin'
import {PASSKEY_BASE_URL} from './constants'
import {
    FingerprintIcon,
    Button
} from 'ui/admin'
import {loginWebAuthn} from './util/navigator.mjs'

registerTrs(translations, 'WebAuthn')


export default () => {

    // add entry to main menu
    Hook.on('UserMenu', ({menuItems}) => {
        menuItems.splice(2, 0, {name: _t('webauthn.passkey'), onClick: ()=> {
                _app_.history.push(PASSKEY_BASE_URL)

            }, icon: 'fingerprint'})
    })


    Hook.on('LoginContainerBeforeRender', ({loginAlternatives, container}) => {
        loginAlternatives.push(<Button sx={{width:'100%'}} color="secondary" variant="outlined" endIcon={<FingerprintIcon />}
                                       onClick={async ()=>{
                                           const response = await loginWebAuthn()
                                           if(response.error) {

                                           }else{
                                               console.log(response.data.loginWebAuthnPasskey)
                                               container.loginWithResponse(response.data.loginWebAuthnPasskey)
                                           }
                                       }}>
            {_t('webauthn.loginWithPasskey')}
        </Button>)
    })

}
