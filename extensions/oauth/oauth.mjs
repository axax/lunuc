// server/oauth.mjs
import crypto from 'crypto'
import Util from 'api/util/index.mjs'
import oAuthResolver from './gensrc/resolver.mjs'
import {auth} from '../../api/auth.mjs'
import {ObjectId} from "mongodb";
import {
    checkClientParams,
    checkOidcAuthorizeParams,
    clientCredentials,
    createOidcTokenResponse,
    isOidcClient,
    oidcCodeData,
    verifyPkce
} from './oidc.mjs'

export async function oauthAuthorize(db, req, res) {
    const { client_id, redirect_uri,  response_type, scope, domain, state, prompt } = req.query

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

    // 4.-6. Client aktiv, redirect_uri gegen Whitelist, Scopes
    const error = checkClientParams(clientData, {redirect_uri, scope})
    if (error) {
        return res.status(400).json({ error })
    }

    // OpenID Connect Clients (allowedScopes enthält "openid"): PKCE S256 Pflicht
    if (isOidcClient(clientData)) {
        const oidcError = checkOidcAuthorizeParams(req.query)
        if (oidcError) {
            return res.status(400).json({ error: oidcError })
        }

        // 7. SSO: Benutzer ist auf dieser Domain bereits eingeloggt -> direkt Code ausstellen
        if (req.context && req.context.id && prompt !== 'login' && ObjectId.isValid(req.context.id)) {
            const redirectUrl = await issueCode(db, req, {
                clientData, scope, state, redirect_uri,
                user: {_id: new ObjectId(req.context.id)},
                oidc: oidcCodeData(req.query)
            })
            return res.redirect(redirectUrl)
        }
    }

    // 8. Sonst: zum Login weiterleiten
    const forward = encodeURIComponent(req.originalUrl)
    res.redirect(`/admin/login?forward=${forward}&domain=${domain||''}&oauth=true`)
}

export async function issueCode(db, req, {clientData, scope, state, redirect_uri, user, oidc }) {

    // 1. Zufälligen Code generieren
    const code = crypto.randomBytes(32).toString('hex')

    // 2. Code in DB speichern
    await oAuthResolver(db).Mutation.createOAuthCode({
        createdBy: user._id,
        code,
        client: clientData._id,
        scope:       scope || '',
        redirectUri: redirect_uri || '',
        expiresAt:   new Date(Date.now() + 60 * 1000), // 60 Sekunden
        used:        false,
        ...oidc // nur bei OpenID Connect Clients: codeChallenge, codeChallengeMethod, nonce
    }, req, {skipCheck:true})


    // 3. Redirect zum Client mit Code und State
    const redirect = new URL(redirect_uri)
    redirect.searchParams.set('code', code)
    if (state) redirect.searchParams.set('state', state)

    return redirect.toString()
}



export async function oauthToken(db, req, res) {
    const { grant_type, code, redirect_uri, code_verifier } = req.body
    // client_secret_post wie bisher, zusätzlich client_secret_basic
    const { client_id, client_secret } = clientCredentials(req)

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
    if (!await Util.compareWithHashedPasswordAsync(client_secret, clientData.clientSecretHash)) {
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

    // 9b. PKCE (nur wenn beim authorize eine code_challenge mitkam)
    if (!verifyPkce(codeData, code_verifier)) {
        return res.status(400).json({ error: 'invalid_grant', hint:'pkce_mismatch' })
    }

    // 10. Code als verwendet markieren (atomar: ein Code kann nur einmal eingelöst werden)
    const marked = await db.collection('OAuthCode').updateOne(
        { _id: codeData._id, used: { $ne: true } },
        { $set: { used: true } }
    )
    if (marked.modifiedCount !== 1) {
        return res.status(400).json({ error: 'invalid_grant', hint:'already_used' })
    }

    // OpenID Connect: id_token + eigener, kurzlebiger Access-Token (kein Lunuc-Session-Token)
    if (isOidcClient(clientData)) {
        const {status, body} = await createOidcTokenResponse(db, req, {clientData, codeData})
        res.set({'Cache-Control': 'no-store', Pragma: 'no-cache'})
        return res.status(status).json(body)
    }


    // add user group name
    let groupName = []
    if (codeData.createdBy && ObjectId.isValid(codeData.createdBy)) {
        const user = await Util.userById(db, codeData.createdBy)

        groupName = user.group
            ? (await Promise.all(
                user.group.map(async g => {
                    const group = await Util.getUserGroup(db, g)
                    return group ? group.name : null
                })
            ))
            : []
    }


    // 11. Access Token generieren
    const {token} = await auth.signPayload(db, codeData.createdBy, {
        oauth:{client: clientData._id},
        groupName,
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
