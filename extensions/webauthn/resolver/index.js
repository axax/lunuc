import Util from 'api/util/index.mjs'
import crypto from 'crypto'
import {getHostFromHeaders} from '../../../util/host.mjs'
import {decodeAttestation, parseAuthData} from '../util/attestation.mjs'
import genResolver from '../gensrc/resolver.mjs'
import {USE_COOKIES} from '../../../api/constants/index.mjs'
import {setAuthCookies} from "../../../api/util/sessionContext.mjs";
import jwkToPem from 'jwk-to-pem'
import {ObjectId} from 'mongodb'
import {auth} from '../../../api/auth.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'


const sha256 = (data) => {
    const hash = crypto.createHash('sha256')
    hash.update(data)
    return hash.digest()
}


const attestationTypeMap = {
    none:{
        verifyAttestation: () => {},
        verifyAssertion: () => {}
    },
    packed:{
        verifyAttestation: () => {},
        verifyAssertion: () => {}
    }
}

// challenges per session. Anyone can request one (also anonymous), so entries
// expire and the map is limited - otherwise it would grow without bound.
const CHALLENGE_TTL_MS = 2 * 60 * 1000
const CHALLENGE_MAX_ENTRIES = 10000
const sessionChallengeMap = new Map()

const sweepChallenges = () => {
    const now = Date.now()
    for (const [session, entry] of sessionChallengeMap) {
        if (entry.expires < now) {
            sessionChallengeMap.delete(session)
        }
    }
    // still too many: drop the oldest (a Map keeps insertion order)
    while (sessionChallengeMap.size >= CHALLENGE_MAX_ENTRIES) {
        sessionChallengeMap.delete(sessionChallengeMap.keys().next().value)
    }
}

const checkChallenge = (clientDataJson, context) => {
    const challenge = atob(clientDataJson.challenge)
    const entry = sessionChallengeMap.get(context.session)
    sessionChallengeMap.delete(context.session)
    if(!challenge || !entry || entry.expires < Date.now() || challenge !== entry.challenge){
        throw Error('Invalid challenge')
    }
}

function checkOrigin(clientDataJson, expectedHost) {
    const origin = new URL(clientDataJson.origin)
    if (origin.hostname !== expectedHost) {
        throw new Error(`Invalid value in property "clientDataJSON.origin". Expected hostname "${expectedHost}"`)
    }
    if (origin.hostname !== 'localhost' && origin.protocol !== 'https:') {
        throw new Error('Invalid value in property "clientDataJSON.origin". Expected HTTPS protocol.')
    }
}

function checkRpIdHashAndFlags(expectedHost, authData) {
    // Verify that the rpIdHash in authData is the SHA-256 hash of the RP ID expected by the Relying Party.
    const expectedRpIdHash = sha256(expectedHost)
    if (!authData.rpIdHash.equals(expectedRpIdHash)) {
        throw new Error(`The value of "attestationObject.authData.rpIdHash" is wrong. Expected hash "${expectedRpIdHash}"`)
    }
    // Verify that the User Present bit of the flags in authData is set.
    if ((authData.flags & 0b00000001) === 0) {
        throw new Error('User Present bit was not set in "attestationObject.authData.flags"')
    }
}

export default (db) => ({
    Query: {
        getWebAuthnChallenge:  async ({}, {context}) => {

            const challenge = crypto.randomBytes(32).toString('hex')

            sweepChallenges()
            sessionChallengeMap.set(context.session, {challenge, expires: Date.now() + CHALLENGE_TTL_MS})

            return {challenge}

        },
        loginWebAuthnPasskey: async ({id,clientData,userHandle,signature,authenticatorData}, req) => {

            const clientDataJson = JSON.parse(clientData)

            if (clientDataJson.type !== 'webauthn.get') {
                throw new Error('The value of property "clientDataJson.type" is not "webauhn.get"')
            }

            checkChallenge(clientDataJson,req.context)

            const expectedHost = getHostFromHeaders(req.headers)
            checkOrigin(clientDataJson, expectedHost)

            const authData = parseAuthData(Buffer.from(authenticatorData, 'base64'))
            checkRpIdHashAndFlags(expectedHost, authData)

            // Verify that the values of the client extension outputs in clientExtensionResults and the authenticator
            // extension outputs in the extensions in authData are as expected, considering the client extension input values
            // that were given as the extensions option in the get() call.
            if (authData.extensions) {
                // We didn't request any extensions. If extensionData is defined, fail.
                throw new Error('Received unexpected extension data')
            }

            const credential = await db.collection('WebAuthnCredential').findOne({credId: id})

            // a credential only logs in the user it was registered for. Credentials without
            // owner (created before this check existed) are not accepted any more.
            if(!credential || !credential.publicKey || !credential.createdBy){
                throw Error('Invalid credential')
            }

            // Let hash be the result of computing a hash over the cData using SHA-256.
            const clientDataHash = sha256(clientData)

            // Using the credential public key looked up in step 3, verify that sig is a valid signature
            // over the binary concatenation of authData and hash.
            const verify = credential.publicKey.kty === 'RSA' ? crypto.createVerify('RSA-SHA256') : crypto.createVerify('sha256')

            verify.update(Buffer.from(authenticatorData, 'base64'))
            verify.update(clientDataHash)

            const sig = Buffer.from(signature, 'base64')

            if (!verify.verify(jwkToPem(credential.publicKey), sig)) {
                throw new Error('Could not verify signature')
            }


            const user = await db.collection('User').findOneAndUpdate(
                {_id: new ObjectId(credential.createdBy)},
                {$set: {lastLogin: new Date().getTime()}}
            )
            if (!user || user.blocked || user.username === 'anonymous') {
                throw new Error('Login not possible')
            }

            // userHandle is the user id the client set as user.id when the passkey was created
            if (userHandle && Buffer.from(userHandle, 'base64').toString('utf8') !== user._id.toString()) {
                throw new Error('Invalid user handle')
            }

            // same token content as the password login
            const result = await auth.signPayload(db, user)

            if (USE_COOKIES) {
                setAuthCookies(result, req, req.res)
                // delete token because it is handled by cookies
                delete result.token
            }

            return result

        },
        addWebAuthnPasskey: async ({id,clientData,attestation}, req) => {
            Util.checkIfUserIsLoggedIn(req.context)
            if (!req.context.id || req.context.username === 'anonymous') {
                throw new Error('Not allowed')
            }

            const clientDataJson = JSON.parse(clientData)

            checkChallenge(clientDataJson,req.context)

            const expectedHost = getHostFromHeaders(req.headers)
            checkOrigin(clientDataJson, expectedHost)

            let attestationObject = decodeAttestation(attestation)

            const authData = parseAuthData(attestationObject.authData)

            checkRpIdHashAndFlags(expectedHost, authData)



            // If user verification is required for this registration, verify that the User
            // Verified bit of the flags in authData is set.
            //if (userVerification === 'required' && (authenticatorData.flags & 0b00000100) == 0) {
            //    throw new Error('User Verified bit was not set in "attestationObject.authData.flags"')
            //}


            // Determine the attestation statement format by performing a USASCII case-sensitive match on fmt against
            // the set of supported WebAuthn Attestation Statement Format Identifier values.
            if (!Object.keys(attestationTypeMap).includes(attestationObject.fmt)) {
                throw new Error(`Attestation statement format not supported: ${attestationObject.fmt}`)
            }

            const clientDataHash = sha256(clientData)
            attestationTypeMap[attestationObject.fmt].verifyAttestation(attestationObject, clientDataHash)


            // Check that the credentialId is not yet registered to any other user. If registration is requested
            // for a credential that is already registered to a different user, the Relying Party SHOULD fail this
            // registration ceremony, or it MAY decide to accept the registration, e.g. while deleting the older registration.
            //if (!isValidCredentialId(authData.credentialId)) {
            //    throw new Error('CredentialId is not allowed')
            //}


            // If the attestation statement attStmt verified successfully and is found to be trustworthy, then register
            // the new credential with the account that was denoted in the options.user passed to create(), by associating it
            // with the credentialId and credentialPublicKey in the attestedCredentialData in authData, as appropriate for the
            // Relying Party's system.
            const credId = authData.attestedCredentialData.credentialId.toString('base64')

            const collection = db.collection('WebAuthnCredential')
            if (await collection.findOne({credId})) {
                throw new Error('Credential already registered')
            }

            // written directly (not via the generic createWebAuthnCredential, which is closed
            // for normal users) - the credential always belongs to the logged in user
            const now = new Date().getTime()
            const insertResult = await collection.insertOne({
                credId,
                publicKey: authData.attestedCredentialData.publicKeyJwk,
                userAgent: req.headers['user-agent'] || '',
                createdBy: new ObjectId(req.context.id),
                modifiedAt: now
                //signCount: authData.signCount,
            })

            return {_id: insertResult.insertedId, credId, status: 'created'}
        }
    },
    Mutation: {
        // The generated mutation was open for everyone (access.create "anonymous") and allowed
        // to store any public key - which then could be used to log in. Only admins may use it.
        createWebAuthnCredential: async (data, req, options) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_OTHER_USERS)
            return genResolver(db).Mutation.createWebAuthnCredential(data, req, options)
        }
    }
})
