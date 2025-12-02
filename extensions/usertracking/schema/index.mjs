export default `
   type TrackingResponse{
        status:String
    }
	type Mutation {
		doTracking (
			event: String!
		): TrackingResponse
	}
`
