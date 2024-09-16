export default `
    
    type WebAuthnChallengeResponse{
        challenge: String
    }
    
    type Query {
        getWebAuthnChallenge: WebAuthnChallengeResponse
        addWebAuthnPasskey(id:String!,clientData:String!,attestation:String!): WebAuthnCredential
        loginWebAuthnPasskey(id:String!,clientData:String!,userHandle:String!,signature:String!,authenticatorData:String!): Token
    }    
`