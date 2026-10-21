// queries only used in the admin ui (kept out of ./index.mjs, which is part of the main bundle)
export const COLLECTIONS_QUERY = 'query collections($filter:String){collections(filter:$filter){results{name}}}'
export const COLLECTIONS_SYNC_QUERY = 'mutation syncCollectionEntries($fromVersion:String!,$toVersion:String!,$type:String!,$ids:[ID]!){syncCollectionEntries(fromVersion:$fromVersion,toVersion:$toVersion,type:$type,ids:$ids){result}}'
export const COMMAND_QUERY = 'query run($command:String!,$sync:Boolean){run(command:$command,sync:$sync){response}}'
