export const USER_DATA_QUERY = 'query{me{username email _id role{_id capabilities}}}'
export const COLLECTIONS_QUERY = 'query collections($filter:String){collections(filter:$filter){results{name}}}'
