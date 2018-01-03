export const socialSchemaRaw = `

    type LinkedInData {
        firstName: String
        headline: String
        id: String
        lastName: String
    }
      
      
    type Query {
        linkedin(redirectUri: String): LinkedInData
    }
    
`