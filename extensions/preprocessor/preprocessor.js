import {ObjectId} from 'mongodb'

export const preProcessorsCache = {}

export const processById = async (id, content, context) => {
    let preProcessor = preProcessorsCache[id]
    if (!preProcessor) {
        preProcessor = await context.db.collection('PreProcessor').findOne({_id: ObjectId(id)})
        preProcessorsCache[id] = preProcessor
    }

    if (preProcessor) {
        const process = await processByProcessor(preProcessor, content, context)
        if (process.error) {
            return {data: content, error: process.error}
        } else {
            return {data: await process.data}
        }

    } else {
        console.warn(`PreProcessor with id ${id} doesn't exist`)
        return {data: content, error: `PreProcessor with id ${id} doesn't exist`}
    }


}


const processByProcessor = (preProcessor, content, context) => {

    console.log(`run preprocessor ${preProcessor.name}`)
    return new Promise(resolve => {

        try {
            const tpl = new Function(`
            const require = this.require
            const data = (async () => {
                try{
                    ${preProcessor.script}
                }catch(error){
                    this.resolve({error})
                }
            })()
            this.resolve({data})`)
            tpl.call({content, resolve, require, ...context})
        } catch (error) {
            resolve({error})
        }

    })
}
