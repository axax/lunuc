import React from 'react'
import {SimpleButton, TextField, Typography, FingerprintIcon} from 'ui/admin'
import {client} from 'client/middleware/graphql'
import {_t} from 'util/i18n.mjs'
import {loginWebAuthn} from '../util/navigator.mjs'
import {LOGIN_RESULT_FIELDS} from '../../../client/constants/index.mjs'

// second step of the login for users with two-factor authentication (see LoginContainer)
const TwoFactorLogin = ({container, twoFactorToken}) => {
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState(null)
    const [useCode, setUseCode] = React.useState(false)
    const [code, setCode] = React.useState('')

    const handleResult = (result) => {
        setLoading(false)
        if (result.error) {
            if (!result.cancelled) {
                setError(result.error.message || result.error)
            }
        } else if (result.data) {
            container.loginWithResponse(result.data.loginWebAuthnPasskey || result.data.loginTwoFactorRecoveryCode)
        }
    }

    const loginWithPasskey = async () => {
        setLoading(true)
        setError(null)
        handleResult(await loginWebAuthn({twoFactorToken, meta: container.getLoginMeta()}))
    }

    const loginWithCode = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            handleResult(await client.query({
                fetchPolicy: 'no-cache',
                silent: true,
                query: `query loginTwoFactorRecoveryCode($twoFactorToken:String!,$code:String!,$meta:String){loginTwoFactorRecoveryCode(twoFactorToken:$twoFactorToken,code:$code,meta:$meta){${LOGIN_RESULT_FIELDS}}}`,
                variables: {twoFactorToken, code, meta: container.getLoginMeta()}
            }))
        } catch (e) {
            handleResult({error: e?.error?.message || String(e)})
        }
    }

    const back = () => container.setState({twoFactorToken: null, error: null})

    return <form noValidate autoComplete="off" onSubmit={loginWithCode}>
        <Typography variant="h3" gutterBottom>{_t('webauthn.twoFactor.loginTitle')}</Typography>

        {useCode ? <>
            <TextField label={_t('webauthn.twoFactor.recoveryCode')}
                       autoFocus
                       fullWidth
                       autoComplete="one-time-code"
                       error={!!error}
                       placeholder="xxxx-xxxx-xxxx"
                       helperText={error || _t('webauthn.twoFactor.recoveryCodeHelp')}
                       disabled={loading}
                       value={code}
                       onChange={e => setCode(e.target.value)}
                       name="code"/>
            <SimpleButton variant="contained" color="primary" fullWidth disableElevation sx={{mt: 1}}
                          showProgress={loading} type="submit" disabled={!code.trim()}>
                {_t('webauthn.twoFactor.submit')}
            </SimpleButton>
        </> : <>
            <Typography gutterBottom>{_t('webauthn.twoFactor.loginSubtitle')}</Typography>
            {error && <Typography color="error" gutterBottom>{error}</Typography>}
            <SimpleButton variant="contained" color="primary" fullWidth disableElevation autoFocus sx={{mt: 1}}
                          showProgress={loading} endIcon={<FingerprintIcon/>} onClick={loginWithPasskey}>
                {_t('webauthn.twoFactor.confirmWithPasskey')}
            </SimpleButton>
        </>}

        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '1rem'}}>
            <SimpleButton size="small" onClick={back}>{_t('webauthn.twoFactor.back')}</SimpleButton>
            <SimpleButton size="small" onClick={() => {
                setUseCode(!useCode)
                setError(null)
            }}>{useCode ? _t('webauthn.twoFactor.confirmWithPasskey') : _t('webauthn.twoFactor.useRecoveryCode')}</SimpleButton>
        </div>
    </form>
}

export default TwoFactorLogin
