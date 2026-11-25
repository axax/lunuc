export default `
   type TrackingResponse{
        status:String
    }
	type Query {
		userTrackingPageStats (
			slug: String!
			days: Int
			detail: Boolean
		): String
	}
	type Mutation {
		doTracking (
			event: String!
		): TrackingResponse
	}
`
