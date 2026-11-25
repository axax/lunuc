import React from 'react'
import {Paper, Typography, SimpleSwitch, SimpleButton, SimpleDialog, TextField, FingerprintIcon} from 'ui/admin'
import {client} from 'client/middleware/graphql'
import {_t} from 'util/i18n.mjs'
import {getPasskeyAssertion, registerWebAuthn} from '../util/navigator.mjs'
import {Link} from '../../../client/util/route'
import {PASSKEY_BASE_URL} from '../constants'

const DefaultWrapper = ({title, hint, children}) => <Paper sx={{p: 2, mb: 4}} variant="outlined">
    <Typography variant="h5" gutterBottom>{title}</Typography>
    <Typography variant="body2" color="text.secondary" gutterBottom>{hint}</Typography>
    {children}
</Paper>

const STATUS_FIELDS = 'enabled passkeys recoveryCodesLeft recoveryCodes'

/*
 Two-factor settings of the logged in user. Changes need the password, so a session
 taken over (e.g. an unlocked computer) can not silently disable 2FA.
 */
/*
 Wrapper: renders title, hint and content (the profile passes its own Section).
 passkeyActions: create / manage passkeys from here (in the profile - the passkey page has its own list)
 */
const TwoFactorSettings = React.forwardRef(({Wrapper = DefaultWrapper, passkeyActions = false}, ref) => {
    const [status, setStatus] = React.useState(null)
    // pending action that needs the password: 'enable' | 'disable' | 'regenerate'
    const [action, setAction] = React.useState(null)
    const [password, setPassword] = React.useState('')
    const [error, setError] = React.useState(null)
    const [loading, setLoading] = React.useState(false)
    const [codes, setCodes] = React.useState(null)

    const load = React.useCallback(() => {
        client.query({fetchPolicy: 'network-only', query: `query{twoFactorStatus{${STATUS_FIELDS}}}`})
            .then(r => setStatus(r.data.twoFactorStatus))
            .catch(() => {})
    }, [])

    React.useEffect(load, [load])
    // the passkey list calls reload() after a passkey was added or deleted
    React.useImperativeHandle(ref, () => ({reload: load}), [load])

    const closeDialog = () => {
        setAction(null)
        setPassword('')
        setError(null)
    }

    const submit = async () => {
        setLoading(true)
        setError(null)
        let passkey
        if (action === 'enable') {
            // proves that a passkey of this host works before the password alone is no longer enough
            const {assertion, error, cancelled} = await getPasskeyAssertion()
            if (error) {
                setError(cancelled ? _t('webauthn.twoFactor.passkeyCancelled') : error)
                setLoading(false)
                return
            }
            passkey = JSON.stringify(assertion)
        }
        const mutation = action === 'regenerate'
            ? `mutation regenerateTwoFactorRecoveryCodes($password:String!){regenerateTwoFactorRecoveryCodes(password:$password){${STATUS_FIELDS}}}`
            : `mutation setTwoFactor($enabled:Boolean!,$password:String!,$passkey:String){setTwoFactor(enabled:$enabled,password:$password,passkey:$passkey){${STATUS_FIELDS}}}`
        try {
            const r = await client.mutate({mutation, silent: true, variables: {password, enabled: action === 'enable', passkey}})
            const newStatus = r.data.regenerateTwoFactorRecoveryCodes || r.data.setTwoFactor
            setStatus(newStatus)
            if (newStatus.recoveryCodes) {
                setCodes(newStatus.recoveryCodes)
            }
            closeDialog()
        } catch (e) {
            setError(e?.error?.message || String(e))
        }
        setLoading(false)
    }

    const downloadCodes = () => {
        const text = `${_app_.config.APP_NAME || 'Lunuc'} - ${_t('webauthn.twoFactor.codesTitle')}\n${location.host} / ${_app_.user.username}\n\n${_t('webauthn.twoFactor.codesFileHint')}\n\n${codes.map(c => '[ ] ' + c).join('\n')}\n`
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([text], {type: 'text/plain'}))
        a.download = `recovery-codes-${location.host}.txt`
        a.click()
        URL.revokeObjectURL(a.href)
    }

    if (!status) {
        return null
    }

    const canEnable = status.passkeys > 0

    const createPasskey = async () => {
        setError(null)
        const result = await registerWebAuthn()
        if (result.error) {
            setError(result.error.message || String(result.error))
        } else {
            load()
        }
    }

    return <Wrapper title={_t('webauthn.twoFactor.title')} hint={_t('webauthn.twoFactor.description')}>

        <SimpleSwitch
            label={status.enabled ? _t('webauthn.twoFactor.enabled') : _t('webauthn.twoFactor.disabled')}
            checked={!!status.enabled}
            disabled={!status.enabled && !canEnable}
            onChange={e => setAction(e.target.checked ? 'enable' : 'disable')}/>

        {!status.enabled && !canEnable &&
            <Typography variant="body2" color="warning.main">{_t('webauthn.twoFactor.passkeyRequired')}</Typography>}

        {status.enabled && <div style={{display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap'}}>
            <Typography variant="body2" color={status.recoveryCodesLeft < 3 ? 'warning.main' : 'text.secondary'}>
                {_t('webauthn.twoFactor.codesLeft', {count: status.recoveryCodesLeft})}
            </Typography>
            <SimpleButton size="small" variant="outlined" onClick={() => setAction('regenerate')}>
                {_t('webauthn.twoFactor.regenerate')}
            </SimpleButton>
        </div>}

        {action && <SimpleDialog open={true}
                                 maximizable={false}
                                 title={_t('webauthn.twoFactor.confirmPassword')}
                                 onClose={a => a?.key === 'ok' ? submit() : closeDialog()}
                                 actions={[
                                     {key: 'cancel', label: _t('webauthn.twoFactor.cancel')},
                                     {key: 'ok', label: _t(action === 'enable' ? 'webauthn.twoFactor.enable' : action === 'disable' ? 'webauthn.twoFactor.disable' : 'webauthn.twoFactor.regenerate'), type: 'primary', variant: 'contained', disabled: loading || !password}
                                 ]}>
            {action === 'enable' && <Typography variant="body2" gutterBottom>{_t('webauthn.twoFactor.enableHint')}</Typography>}
            <form onSubmit={e => {
                e.preventDefault()
                if (password) submit()
            }}>
                <TextField label={_t('webauthn.twoFactor.password')}
                           type="password"
                           autoComplete="current-password"
                           autoFocus
                           fullWidth
                           value={password}
                           error={!!error}
                           helperText={error}
                           onChange={e => setPassword(e.target.value)}/>
            </form>
        </SimpleDialog>}

        {codes && <SimpleDialog open={true}
                                maximizable={false}
                                title={_t('webauthn.twoFactor.codesTitle')}
                                onClose={a => {
                                    if (a?.key === 'copy') {
                                        navigator.clipboard?.writeText(codes.join('\n'))
                                    } else if (a?.key === 'download') {
                                        downloadCodes()
                                    } else if (a?.key === 'ok') {
                                        // not on backdrop click / escape - the codes are shown only once
                                        setCodes(null)
                                    }
                                }}
                                actions={[
                                    {key: 'copy', label: _t('webauthn.twoFactor.copy')},
                                    {key: 'download', label: _t('webauthn.twoFactor.download')},
                                    {key: 'ok', label: _t('webauthn.twoFactor.ok'), type: 'primary', variant: 'contained', divider: true}
                                ]}>
            <Typography gutterBottom>{_t('webauthn.twoFactor.codesHint')}</Typography>
            <pre style={{fontSize: '1.1rem', lineHeight: 1.8, columns: 2, margin: '1rem 0', userSelect: 'all'}}>{codes.join('\n')}</pre>
        </SimpleDialog>}

        {passkeyActions && <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', flexWrap: 'wrap'}}>
            {!action && error && <Typography variant="body2" color="error">{error}</Typography>}
            <SimpleButton variant="outlined" color="primary" component={Link} to={PASSKEY_BASE_URL}>
                {_t('webauthn.twoFactor.managePasskeys', {count: status.passkeys})}
            </SimpleButton>
            {!canEnable && <SimpleButton variant="contained" color="primary" endIcon={<FingerprintIcon/>} onClick={createPasskey}>
                {_t('PasskeyContainer.createNewPasskey')}
            </SimpleButton>}
        </div>}
    </Wrapper>
})

export default TwoFactorSettings
