import Util from 'api/util'

export default db => ({
    Query: {
        sendTelegramMessage: async ({message}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)





            return {response: `xxxx`}
        }
    }
})
