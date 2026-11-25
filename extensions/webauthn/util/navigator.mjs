import {client} from '../../../client/middleware/graphql.js'
import {arrayBufferToString, base64encode} from './parse.mjs'
import {LOGIN_RESULT_FIELDS} from '../../../client/constants/index.mjs'


// asks the browser for a passkey of this host and returns the signed challenge
export const getPasskeyAssertion = async () => {
    const challengeResponse = await client.query({fetchPolicy: 'network-only',query: 'query{getWebAuthnChallenge{challenge}}' })
    const challenge = challengeResponse?.data?.getWebAuthnChallenge?.challenge
    if(!challenge) {
        return {error:'No challenge'}
    }
    let credentials
    try {
        credentials = await navigator.credentials.get({
            publicKey: {
                challenge: new TextEncoder().encode(challenge), // Server-generated random challenge
                timeout: 60000, // Timeout for the operation
                userVerification: 'preferred', // Specify user verification preference
            },
        })
    }catch (error){
        console.log(error)
        return {error: error?.message || String(error), cancelled: error?.name === 'NotAllowedError'}
    }
    return {
        assertion: {
            id: base64encode(credentials.rawId),
            clientData: arrayBufferToString(credentials.response.clientDataJSON),
            userHandle: base64encode(credentials.response.userHandle),
            signature: base64encode(credentials.response.signature),
            authenticatorData: base64encode(credentials.response.authenticatorData)
        }
    }
}

// twoFactorToken: passkey as second factor after the password
export const loginWebAuthn = async ({twoFactorToken, meta} = {}) => {
    const {assertion, error, cancelled} = await getPasskeyAssertion()
    if (error) {
        return {error, cancelled}
    }
    try {
        return await client.query({
            fetchPolicy: 'network-only',
            silent: true,
            variables: {...assertion, twoFactorToken, meta},
            query: `query loginWebAuthnPasskey($id:String!,$clientData:String!,$userHandle:String!,$signature:String!,$authenticatorData:String!,$twoFactorToken:String,$meta:String){loginWebAuthnPasskey(id:$id,clientData:$clientData,signature:$signature,userHandle:$userHandle,authenticatorData:$authenticatorData,twoFactorToken:$twoFactorToken,meta:$meta){${LOGIN_RESULT_FIELDS}}}`
        })
    } catch (e) {
        // graphql error (invalid passkey, expired ...)
        return {error: e?.error?.message || String(e)}
    }
}

export const registerWebAuthn = async () => {
    const challengeResponse = await client.query({fetchPolicy: 'network-only',query: 'query{getWebAuthnChallenge{challenge}}' })
    const challenge = challengeResponse?.data?.getWebAuthnChallenge?.challenge
    if(challenge){
        let createCredentials
        try {
            createCredentials = await navigator.credentials.create({
                publicKey: {
                    user: {
                        id: new TextEncoder().encode(_app_.user._id), // Unique user ID (server-generated)
                        name: _app_.user.email, // User identifier (e.g., email)
                        displayName: _app_.user.username, // User's display name
                    },
                    rp: {
                        name: _app_.config.APP_NAME, // sample relying party
                    },
                    challenge: new TextEncoder().encode(challenge), // Server-generated random challenge
                    pubKeyCredParams: [
                        {
                            type: "public-key",
                            alg: -7 // "ES256" as registered in the IANA COSE Algorithms registry
                        },
                        {
                            type: "public-key",
                            alg: -257 // Value registered by this specification for "RS256"
                        }
                    ],
                    timeout: 60000, // Timeout for the operation
                    attestation: 'none', // Attestation type (can be "direct" or "none")
                    authenticatorSelection: {
                        requireResidentKey: _app_.user.email,
                        userVerification: 'preferred'
                    }
                }
            })
        }catch(error){
            console.log(error)
            return {error}
        }

        const addPasskeyResult = await client.query({
                fetchPolicy: 'network-only',
                variables: {
                    id: base64encode(createCredentials.rawId),
                    clientData: arrayBufferToString(createCredentials.response.clientDataJSON),
                    attestation: base64encode(createCredentials.response.attestationObject)
                },
                query: 'query addWebAuthnPasskey($id:String!,$clientData:String!,$attestation:String!){addWebAuthnPasskey(id:$id,clientData:$clientData,attestation:$attestation){status}}'
            })
        return addPasskeyResult
    }else{
        return {error:'No challenge'}
    }

}