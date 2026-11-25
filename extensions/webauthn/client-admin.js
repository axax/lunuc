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
import {lazy} from 'client/components/Async'

const TwoFactorSettings = lazy(() => import(/* webpackChunkName: "admin" */ './components/TwoFactorSettings'))
const TwoFactorLogin = lazy(() => import(/* webpackChunkName: "admin" */ './components/TwoFactorLogin'))

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
                                           const response = await loginWebAuthn({meta: container.getLoginMeta()})
                                           if(response.error) {
                                               if(!response.cancelled) {
                                                   container.setState({error: response.error})
                                               }
                                           }else{
                                               container.loginWithResponse(response.data.loginWebAuthnPasskey)
                                           }
                                       }}>
            {_t('webauthn.loginWithPasskey')}
        </Button>)
    })

    // two-factor settings in the user profile
    Hook.on('UserProfileSections', ({sections, Section}) => {
        sections.push(<TwoFactorSettings key="webauthn" Wrapper={Section} passkeyActions={true}/>)
    })

    // second factor after the password (user has two-factor authentication enabled)
    Hook.on('LoginContainerTwoFactor', ({content, container, twoFactorToken}) => {
        content.push(<TwoFactorLogin key="webauthn" container={container} twoFactorToken={twoFactorToken}/>)
    })

}
