export default `
    
    type WebAuthnChallengeResponse{
        challenge: String
    }
    type AddWebAuthnPasskeyResponse{
        status: String
    }

    type Query {
        getWebAuthnChallenge: WebAuthnChallengeResponse
        addWebAuthnPasskey(id:String!,clientData:String!,attestation:String!): AddWebAuthnPasskeyResponse
        loginWebAuthnPasskey(id:String!,clientData:String!,userHandle:String!,signature:String!,authenticatorData:String!): Token
    }    
`