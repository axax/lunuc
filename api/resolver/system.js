import Util from '../util'
import {execSync} from 'child_process'


export const systemResolver = (db) => ({
    run: async ({command}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)


        if( !command ){
            throw new Error('No command to execute.')
        }


        const options = {
            encoding: 'utf8'
        }

        const  response= execSync(command,options)

        return {response}
    }
})