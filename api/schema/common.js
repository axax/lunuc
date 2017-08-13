
export const commonSchemaRaw = `

	type ListEntry {
		key: String!
    name: String!
  }
  
  type List{
  	data: [ListEntry]
  	selection: [String]
  }
  
  
	type Query {
		speechLanguages: List!
  }
    
`