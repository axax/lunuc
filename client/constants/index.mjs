export const COLLECTIONS_QUERY = 'query collections($filter:String){collections(filter:$filter){results{name}}}'
export const COMMAND_QUERY = 'query run($command:String!,$sync:Boolean){run(command:$command,sync:$sync){response}}'


// used to store settings in local storage if there is no session
export const NO_SESSION_KEY_VALUES = 'NO_SESSION_KEY_VALUES'