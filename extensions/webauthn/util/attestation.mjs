import cbor  from 'cbor'
import crypto from 'crypto'


export const decodeAttestation = (attestation) =>{
    let attestationObject
    try {
        attestationObject = cbor.decodeFirstSync(Buffer.from(attestation, 'base64'))
    } catch (e) {
        throw new Error('Property "attestationObject" could not be decoded')
    }
    return attestationObject
}


// Parse AuthenticatorData
// https://www.w3.org/TR/webauthn/#sec-authenticator-data
export const parseAuthData = (authData) => {
    const authenticatorData = {}

    // rpIdHash (32 bytes): SHA-256 hash of the RP ID the credential is scoped to.
    authenticatorData.rpIdHash = authData.slice(0, 32)

    // flags (1 byte): bit 0 is the least significant bit
    // Bit 0: User Present
    // Bit 2: User Verified
    // Bit 6: Attested credential data
    // Bit 7: Extension data included
    authenticatorData.flags = authData[32]

    // signCount (4 bytes): Signature counter, 32-bit unsigned big-endian integer.
    authenticatorData.signCount = new DataView(new Uint8Array(authData.slice(33, 37)).buffer).getInt32(0, false)

    // attested credential data (if present)
    // Bit 6 is set
    if (authenticatorData.flags & 0b01000000) {
        // https://www.w3.org/TR/webauthn/#sec-attested-credential-data
        const attestedCredentialData = {}

        // The AAGUID of the authenticator.
        attestedCredentialData.aaguid = unparseUUID(authData.slice(37, 53))

        // Byte length of Credential ID, 16-bit unsigned big-endian integer.
        attestedCredentialData.credentialIdLength = new DataView(new Uint8Array(authData.slice(53, 55)).buffer).getInt16(
            0,
            false
        )

        // Credential ID
        attestedCredentialData.credentialId = authData.slice(55, 55 + attestedCredentialData.credentialIdLength)

        // The credential public key encoded in COSE_Key format, as defined in Section 7 of [RFC8152], using the CTAP2
        // canonical CBOR encoding form.
        const publicKeyCoseBuffer = authData.slice(55 + attestedCredentialData.credentialIdLength, authData.length)

        // convert public key to JWK
        attestedCredentialData.publicKeyJwk = coseToJwk(publicKeyCoseBuffer)

        // assign
        authenticatorData.attestedCredentialData = attestedCredentialData
    }

    // If extension flag is set
    // Bit 7 is set
    if (authenticatorData.flags & 0b10000000) {
        let extensionDataCbor
        if (authenticatorData.attestedCredentialData) {
            // We have to read the whole section again
            // see https://stackoverflow.com/questions/54045911/webauthn-byte-length-of-the-credential-public-key
            extensionDataCbor = cbor.decodeAllSync(
                authData.slice(55 + authenticatorData.attestedCredentialData.credentialIdLength, authData.length)
            )
            extensionDataCbor = extensionDataCbor[1]
        } else {
            extensionDataCbor = cbor.decodeFirstSync(authData.slice(37, authData.length))
        }
        authenticatorData.extensionData = cbor.encode(extensionDataCbor).toString('base64')
    }

    return authenticatorData
}

const unparseUUID = (bytes) => {
    const hexString = Buffer.from(bytes).toString('hex')
    return [
        hexString.slice(0, 8),
        hexString.slice(8, 12),
        hexString.slice(12, 16),
        hexString.slice(16, 20),
        hexString.slice(20),
    ].join('-')
}

const coseToJwk = (cose) => {
    try {
        let publicKeyJwk = {}
        const publicKeyCbor = cbor.decodeFirstSync(cose)

        if (publicKeyCbor.get(3) == -7) {
            publicKeyJwk = {
                kty: 'EC',
                crv: 'P-256',
                x: publicKeyCbor.get(-2).toString('base64'),
                y: publicKeyCbor.get(-3).toString('base64'),
            }
        } else if (publicKeyCbor.get(3) == -257) {
            publicKeyJwk = {
                kty: 'RSA',
                n: publicKeyCbor.get(-1).toString('base64'),
                e: publicKeyCbor.get(-2).toString('base64'),
            }
        } else {
            throw new Error('Unknown public key algorithm')
        }

        return publicKeyJwk
    } catch (e) {
        // console.log(e)
        throw new Error('Could not decode COSE Key')
    }
}