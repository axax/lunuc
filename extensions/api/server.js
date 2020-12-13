import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import url from "url";
import config from 'gensrc/config'

//TODO implement cache
const getApi = async ({slug, db}) => {
    const apis = (await db.collection('Api').find({slug, active: true}).toArray())
    if (apis.length > 0) {
        return apis[0]
    }

    return null
}

const runApiScript = ({api, db, req, res}) => {
    return new Promise(resolve => {

        try {
            const tpl = new Function(`
            const require = this.require
            const data = (async () => {
                try{
                    ${api.script}
                }catch(error){
                    this.resolve({error})
                }
            })()
            this.resolve({data})`)
            tpl.call({require, resolve, db, context: req.context, req, res, __dirname})
        } catch (error) {
            resolve({error})
        }

    })
}

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('appready', ({app, db}) => {

    app.use('/' + config.API_PREFIX, async (req, res) => {

        const slug = url.parse(req.url).pathname.substring(1)

        const api = await getApi({slug, db})

        if (!api) {
            res.writeHead(404, {'content-type': 'application/json'})
            res.end(`{"status":"notfound","message":"Api for '${slug}' not found"}`)
        } else {
            const result = await runApiScript({api, db, req, res})

            if (result.error) {
                console.error(result.error)
                res.writeHead(500, {'content-type': 'application/json'})
                res.end(`{"status":"error","message":"${result.error.message}"}`)
            } else {
                res.writeHead(res.responseCode || 200, {'content-type': api.mimeType || 'application/json'})
                const data = await result.data
                res.end(data ? data.toString() : data)
            }

        }

    })
})


// Hook when the type Api has changed
Hook.on('typeUpdated_Api', ({db, result}) => {
})
