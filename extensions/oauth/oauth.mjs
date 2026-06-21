// server/oauth.mjs
import crypto from 'crypto'
import Util from 'api/util/index.mjs'
import oAuthResolver from './gensrc/resolver.mjs'
import {auth} from '../../api/auth.mjs'

export async function oauthAuthorize(db, req, res) {
    const { client_id, redirect_uri,  response_type, scope, domain } = req.query

    // 1. Pflichtfelder prüfen
    if (!client_id || !redirect_uri || !response_type) {
        return res.status(400).json({ error: 'invalid_request' })
    }

    // 2. response_type prüfen (vor DB-Abfrage)
    if (response_type !== 'code') {
        return res.status(400).json({ error: 'unsupported_response_type' })
    }

    // 3. Client aus DB laden – await nicht vergessen!
    const clientData = await db.collection('OAuthClient').findOne({ clientId: client_id })

    // 4. Client existiert und ist aktiv?
    if (!clientData || clientData.isActive === false) {
        return res.status(400).json({ error: 'invalid_client' })
    }

    // 5. redirect_uri gegen Whitelist prüfen
    const allowedUris = clientData.allowedRedirectUris
        ? clientData.allowedRedirectUris.split(/[,\n]+/).map(u => u.trim())
        : []

    if (allowedUris.length>0 && !allowedUris.includes(redirect_uri)) {
        return res.status(400).json({ error: 'invalid_redirect_uri' })
    }

    // 6. Scopes prüfen (falls vorhanden)
    if (scope && clientData.allowedScopes) {
        const allowed = clientData.allowedScopes.split(/[\s,]+/).map(s => s.trim())
        const requested = scope.split(' ')
        const invalid = requested.filter(s => !allowed.includes(s))
        if (invalid.length > 0) {
            return res.status(400).json({ error: 'invalid_scope' })
        }
    }

    // 7. Benutzer bereits eingeloggt?
    //if (Util.isUserLoggedIn(req.context)) {
    /*    const redirectUrl = await issueCode(db, req, {clientData, scope, state, redirect_uri })

        res.redirect(redirectUrl)
        return*/
   // }

    // 8. Sonst: zum Login weiterleiten
    const forward = encodeURIComponent(req.originalUrl)
    res.redirect(`/admin/login?forward=${forward}&domain=${domain||''}&oauth=true`)
}

export async function issueCode(db, req, {clientData, scope, state, redirect_uri }) {

    // 1. Zufälligen Code generieren
    const code = crypto.randomBytes(32).toString('hex')

    // 2. Code in DB speichern
    await oAuthResolver(db).Mutation.createOAuthCode({
        code,
        client: clientData._id,
        scope:       scope || '',
        redirectUri: redirect_uri || '',
        expiresAt:   new Date(Date.now() + 60 * 1000), // 60 Sekunden
        used:        false
    }, req, {skipCheck:true})


    // 3. Redirect zum Client mit Code und State
    const redirect = new URL(redirect_uri)
    redirect.searchParams.set('code', code)
    if (state) redirect.searchParams.set('state', state)

    return redirect.toString()
}



export async function oauthToken(db, req, res) {
    const { grant_type, code, redirect_uri, client_id, client_secret } = req.body

    // 1. Pflichtfelder prüfen
    if (!grant_type || !code || !redirect_uri || !client_id || !client_secret) {
        return res.status(400).json({ error: 'invalid_request' })
    }

    // 2. grant_type prüfen
    if (grant_type !== 'authorization_code') {
        return res.status(400).json({ error: 'unsupported_grant_type' })
    }

    // 3. Client aus DB laden und prüfen
    const clientData = await db.collection('OAuthClient').findOne({ clientId: client_id })

    if (!clientData || clientData.isActive === false) {
        return res.status(401).json({ error: 'invalid_client' })
    }

    // 4. client_secret prüfen
    if (!Util.compareWithHashedPassword(client_secret, clientData.clientSecretHash)) {
        return res.status(401).json({ error: 'invalid_client' })
    }

    // 5. Code aus DB laden
    const codeData = await db.collection('OAuthCode').findOne({ code })

    if (!codeData) {
        return res.status(400).json({ error: 'invalid_grant', hint:'invalid_code' })
    }

    // 6. Code bereits verwendet?
    if (codeData.used) {
        return res.status(400).json({ error: 'invalid_grant', hint:'already_used' })
    }

    // 7. Code abgelaufen?
    if (codeData.expiresAt < new Date()) {
        return res.status(400).json({ error: 'invalid_grant', hint:'expired' })
    }

    // 8. Gehört der Code zu diesem Client?
    if (codeData.client.toString() !== clientData._id.toString()) {
        return res.status(400).json({ error: 'invalid_grant', hint:'client_mismatch' })
    }

    // 9. redirect_uri muss identisch sein wie beim authorize
    if (codeData.redirectUri !== redirect_uri) {
        return res.status(400).json({ error: 'invalid_grant', hint:'redirect_uri_mismatch' })
    }

    // 10. Code als verwendet markieren
    await db.collection('OAuthCode').updateOne(
        { code },
        { $set: { used: true } }
    )

    // 11. Access Token generieren
    const {token} = await auth.signPayload(db, codeData.createdBy, {
        oauth:{client: clientData._id},
        accessScope:clientData.allowedScopes ? clientData.allowedScopes.split(/[\s,]+/) : []
    })


    // 12. Antwort
    return res.json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: codeData.scope
    })
}
