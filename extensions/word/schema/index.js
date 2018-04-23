export default `
    type Translation {
        text: String,
        fromIso: String,
        toIso: String
    }
    
    type Query {
    	translate(text: String!, toIso: String!, fromIso: String): Translation
    }
    
`