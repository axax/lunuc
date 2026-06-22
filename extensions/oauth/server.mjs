import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {issueCode, oauthAuthorize, oauthToken} from './oauth.mjs'
import {ObjectId} from "mongodb";

Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})

Hook.on('login', async ({req, db, metaObj, result}) => {

    if(metaObj.oauth && metaObj.forward){
        const query = metaObj.forward.split('?')[1];
        const params = new URLSearchParams(query)

        const clientData = await db.collection('OAuthClient').findOne({ clientId: params.get('client_id') })

        if(clientData){
            result.redirectUrl = await issueCode(db, req, {clientData,
                user: result.user,
                scope: params.get('scope'),
                state: params.get('state'),
                redirect_uri: params.get('redirect_uri') })
        }
    }
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
