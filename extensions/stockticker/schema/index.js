export default `
    type StockData { 
        price: String
    }
        
    type Query {
    	stockData(name: String!): StockData
    }
`