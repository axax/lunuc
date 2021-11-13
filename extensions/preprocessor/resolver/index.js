import {processById} from '../preprocessor'

export default db => ({
    Query: {
        runPreProcessor: async ({_id, code}, {context}) => {

            const result = await processById(_id, code, {db})
console.log(result)
            return {status: result.error?'error':'success', result: result.data, error: result.error?result.error.message:''}
        }
    }
})
