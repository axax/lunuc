export default `
    type StockData { 
        symbol: String
        price: String
        volume: String
        timestamp: String
    }
    
    type CurrencyData { 
        from: String
        to: String
        fromName: String
        toName: String
        rate: String
        timestamp: String
    }
    
        
    type Query {
    	stockData(symbols: [String]!): [StockData]
    	currencyData(from: String!, to: String!): CurrencyData
    }
`