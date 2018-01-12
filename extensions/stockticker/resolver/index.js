import Util from '../../../api/util'


export default db => ({
    stockData: async ({name}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return {price:Math.random().toString(3)}
    }
})