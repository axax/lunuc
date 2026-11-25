export default `
    
    type WebAuthnChallengeResponse{
        challenge: String
    }
    
    type TwoFactorStatus{
        enabled: Boolean
        passkeys: Int
        recoveryCodesLeft: Int
        # only set directly after enabling / regenerating - shown once
        recoveryCodes: [String]
    }
    
    type Query {
        getWebAuthnChallenge: WebAuthnChallengeResponse
        addWebAuthnPasskey(id:String!,clientData:String!,attestation:String!): WebAuthnCredential
        # twoFactorToken: passkey as second factor after the password
        loginWebAuthnPasskey(id:String!,clientData:String!,userHandle:String!,signature:String!,authenticatorData:String!,twoFactorToken:String,meta:String): Token
        loginTwoFactorRecoveryCode(twoFactorToken:String!,code:String!,meta:String): Token
        twoFactorStatus: TwoFactorStatus
    }
    
    type Mutation {
        # passkey: assertion (JSON) - required to enable, proves that the passkey works
        setTwoFactor(enabled:Boolean!,password:String!,passkey:String): TwoFactorStatus
        regenerateTwoFactorRecoveryCodes(password:String!): TwoFactorStatus
        # admin: disables 2fa of a user that lost all factors
        resetTwoFactor(userId:ID!): TwoFactorStatus
    }
`
