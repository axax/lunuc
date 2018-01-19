export default `
    type Product {
        _id: ID! # unique id for words
        createdBy: UserPublic! # id of user
        name: String!
        description: String
        price: String
        categories: [ProductCategory]    
        status: String
    }
    
    type ProductCategory {
        _id: ID! # unique id for category
        createdBy: UserPublic! # id of user
        name: String!
    }
    
    type ProductResult {
        results: [Product]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	products(sort: String, limit: Int=10, offset: Int=0, filter: String): ProductResult
    }
    
		
	type Mutation {
		createProduct (
			name: String!
			description: String
			price: String
		): Product
		updateProduct(_id: ID!, name: String, description: String, price: String): Product	
		deleteProduct(_id: ID!): Product
	}
`