export default `
type UserTrackingData{
    data: String    
}
type Query {
    userTrackingData(slug: String!): UserTrackingData
}

`
