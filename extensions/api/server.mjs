import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import url from 'url'
import config from '../../gensrc/config.mjs'
import Cache from '../../util/cache.mjs'
import {createRequireForScript, createScriptForWorker} from '../../util/require.mjs'
import Util from '../../api/util/index.mjs'
import {Worker} from 'node:worker_threads'
import {isTemporarilyBlocked} from '../../server/util/requestBlocker.mjs'
import {isString} from '../../client/util/json.mjs'

const CACHE_PREFIX = 'ExtensionsApi-'


const getApi = async ({slug, db}) => {

    const cacheKey = `${CACHE_PREFIX}${slug}`

    const cachedData = Cache.get(cacheKey)
    if(cachedData){
        return cachedData
    }


    const apis = (await db.collection('Api').find({slug, active: true}).toArray())
    if (apis.length > 0) {
        Cache.set(cacheKey, apis[0])
        return apis[0]
    }

    return null
}

const runApiScript = ({api, db, req, res, startTime}) => {
    return new Promise(resolve => {
        try {

            if(api.workerThread){
                const scriptContext = createScriptForWorker(import.meta.url)
                const worker = new Worker(` 
                ${scriptContext.script}     
                
                this.req = this.context.req                 
                this.res = {
                    end: (...args) => {
                         parentPort.postMessage({httpResponse:{method:'end',args}})
                    },
                    write: (...args) => {
                         parentPort.postMessage({httpResponse:{method:'write',args}})
                    },
                    writeHead: (...args) => {
                         parentPort.postMessage({httpResponse:{method:'writeHead',args}})
                    },
                    contentType: (...args) => {
                         parentPort.postMessage({httpResponse:{method:'contentType',args}})
                    },
                    header: (...args) => {
                         parentPort.postMessage({httpResponse:{method:'header',args}})
                    }
                }
                this.responseStatus = {}
                const getReturnValue = async () => {
                    try{                
                        ${api.script}                    
                    }catch(_error){
                        return {_error}
                    }
                }                
                (async () => {
                    const data = await getReturnValue()
                    parentPort.postMessage({returnValue:{data,responseStatus: this.responseStatus}})
                    if(this.db){
                        this.db.client.close()
                    }
                })()
  
                `, {eval: true, workerData: {context:{
                    req:{
                        url:req.url,
                        query:req.query,
                        context: req.context
                    }}}})

                let returnValue = {}

                worker.on('message', msg => {
                    if(msg.clearCache){
                        console.log(`Worker-thread: clearCache ${msg.clearCache}`)
                        Cache.clearStartWith(msg.clearCache)
                    }else if(msg.console) {
                        console[msg.console.type]('Worker-thread:', ...msg.console.args)
                    }else if(msg.returnValue){
                        returnValue = msg.returnValue
                    }else if(msg.httpResponse){
                        res[msg.httpResponse.method](...msg.httpResponse.args)
                    }else{
                        console.log(`Worker-thread: ${msg}`)
                    }
                })

                worker.on('error', (error) => {
                    resolve({error})
                })
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        //args.error(`Worker stopped with exit code ${code}`)
                    }
                    console.log(returnValue)
                    resolve(returnValue)
                })
            }else {
                const requireContext = createRequireForScript(import.meta.url)

                const tpl = new Function(`
                
                ${requireContext.script}
                
                this.responseStatus = {}
                const data = (async () => {
                    try{
                        ${api.script}
                    }catch(error){
                        this.resolve({error})
                        return {_error:error}
                    }
                })()
                this.resolve({data, responseStatus: this.responseStatus})`)
                tpl.call({resolve, require: requireContext.require, db, context: req.context, req, res, startTime})
            }
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


const checkBasicAuth = (req, res, auth)=>  {

    const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')
    if (!login || !password || login !== auth.login || !Util.compareWithHashedPassword(password, auth.password)) {
        res.set('WWW-Authenticate', 'Basic realm="401"')
        res.status(401).send('Authentication required.')
        return false
    }
    return true
}

// Hook when db is ready
Hook.on('appready', ({app, db}) => {

    const API_PREFIXES = config.API_PREFIX?(Array.isArray(config.API_PREFIX)? config.API_PREFIX : [config.API_PREFIX]):[]

    API_PREFIXES.forEach(apiPath=>{
        app.use('/' + apiPath, async (req, res) => {

            const startTime = new Date().getTime()
            const slug = url.parse(req.url).pathname.substring(1).split(`/${config.PRETTYURL_SEPERATOR}/`)[0]

            console.log(`Api request: ${slug}`)

            try {
                const api = await getApi({slug, db})

                if (!api) {
                    res.writeHead(404, {'content-type': 'application/json'})
                    res.end(`{"status":"notfound","message":"Api for '${slug}' not found"}`)
                } else {

                    if(api.workerThread && isTemporarilyBlocked({requestTimeInMs: 5000, requestPerTime: 10,requestBlockForInMs:30000, key:'apiScript'})){
                        res.writeHead(503, {'content-type': 'application/json'})
                        res.end(`{"status":"Service Unavailable","message":"Too many requests. Please try again later."}`)
                        return
                    }

                    if(api.basicAuth && !checkBasicAuth(req, res, {login:api.baUser, password: api.baPassword})) {
                        return
                    }

                    const result = await runApiScript({api, db, req, res, startTime})
                    if (!result.error && result.responseStatus && result.responseStatus.ignore) {

                    } else if (result.error) {
                        Hook.call('ExtensionApiError', {db, req, error: result.error, slug})

                        res.writeHead(500, {'content-type': 'application/json'})
                        res.end(`{"status":"error","message":"${result.error.message}"}`)
                    } else {
                        const data = await result.data

                        if (data && data._error) {
                            Hook.call('ExtensionApiError', {db, req, error: data._error, slug})
                            res.writeHead(500, {'content-type': 'application/json'})
                            res.end(`{"status":"error","message":"${data._error.message}"}`)
                        } else {
                            res.writeHead(res.responseCode || 200, {'content-type': api.mimeType || 'application/json'})
                            res.end(data ? (isString(data) ? data : JSON.stringify(data)) : data)
                        }
                    }
                }
            }catch (e){
                console.log(e)
            }

        })
    })

})


// Hook when the type Api has changed
Hook.on('typeUpdated_Api', ({db, result}) => {
    Cache.clearStartWith(CACHE_PREFIX)
})
