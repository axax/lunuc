export const COLLECTIONS_QUERY = 'query collections($filter:String){collections(filter:$filter){results{name}}}'
export const COLLECTIONS_SYNC_QUERY = 'mutation syncCollectionEntries($fromVersion:String!,$toVersion:String!,$type:String!,$ids:[ID]!){syncCollectionEntries(fromVersion:$fromVersion,toVersion:$toVersion,type:$type,ids:$ids){result}}'
export const COMMAND_QUERY = 'query run($command:String!,$sync:Boolean){run(command:$command,sync:$sync){response}}'


// used to store settings in local storage if there is no session
export const NO_SESSION_KEY_VALUES = 'NO_SESSION_KEY_VALUES'
