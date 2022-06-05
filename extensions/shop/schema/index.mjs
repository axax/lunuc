export default `

    type ShopImportSampleDataResult {
        status: String
        message: String
    }
    
    type PlaceOrderResult {
        status: String
        message: String
    }
    
    type Query {
    	shopImportSampleData: ShopImportSampleDataResult
    	placeOrder: PlaceOrderResult
    }
    
`