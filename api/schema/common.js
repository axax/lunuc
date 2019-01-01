export const commonSchemaRaw = `

    type ListEntry {
        value: String!
        name: String
    }
      
    type SingleSelection{
        data: [ListEntry]
        selection: ListEntry
    }
      
      
    type Query {
        speechLanguages: SingleSelection
        translateLanguages: SingleSelection
    }
    
`