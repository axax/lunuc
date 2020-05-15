export const commonSchemaRaw = `

    type ListEntry {
        value: String!
        name: String
    }
      
    type SingleSelection{
        data: [ListEntry]
        selection: ListEntry
    }
    
    type Translation {
        text: String,
        fromIso: String,
        toIso: String
    }
      
    type Query {
        speechLanguages: SingleSelection
        translateLanguages: SingleSelection
    	translate(text: String!, toIso: String!, fromIso: String): Translation
    }
    
`
