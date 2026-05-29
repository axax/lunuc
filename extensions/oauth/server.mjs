import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {oauthAuthorize, oauthToken} from './oauth.mjs'

Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('appready', ({app, db}) => {

    // curl -v "http://localhost:8080/oauth/authorize?client_id=test&redirect_uri=http://localhost:8080/callback&response_type=code&state=xyz"
    app.get('/oauth/authorize', async (req,res)=>{
        await oauthAuthorize(db,req, res)
    })

    app.post('/oauth/token', async (req,res)=>{
        await oauthToken(db,req, res)
    })

})
