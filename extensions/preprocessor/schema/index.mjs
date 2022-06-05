export default `
    
    type PreProcessorRunResult { 
	    status:String
	    result:String
	    error:String
    }
    
        
    type Query {
    	runPreProcessor(_id: ID!, code: String): PreProcessorRunResult
    }
`
