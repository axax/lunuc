export const commonSchemaRaw = `

    type ListEntry {
        key: String!
        name: String
    }
      
    type SingleSelection{
        data: [ListEntry]
        selection: ListEntry
    }
      
      
    type Query {
        speechLanguages: SingleSelection
    }
    
`