export default `

    type LinkedInPositions{
        _total: Int
        values: [LinkedInPosition]
    }
    
    type LinkedInPosition{
        title: String
        summary: String    
    }

    type LinkedInData {
        firstName: String
        headline: String
        id: String
        lastName: String
        summary: String
        pictureUrl: String
        publicProfileUrl: String
        positions: LinkedInPositions
    }
      
    type Query {
        linkedin(redirectUri: String, linkedInCode: String): LinkedInData
    }
    
`