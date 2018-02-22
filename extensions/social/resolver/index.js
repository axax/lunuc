import Util from 'api/util'
import request from 'request-promise'
import {ObjectId} from 'mongodb'


const LINKEDIN_CLIENT_ID='772exdl15hhf0d'

// this is sensitive - never expose the secret publicly
const LINKEDIN_SECRET='7iKphLFIh8QmqnPT'


//https://www.linkedin.com/psettings/member-data
export default (db) => ({
    linkedin: async ({redirectUri, linkedInCode}, {context}) => {

        const userIsLoggedIn = Util.isUserLoggedIn(context)

        const keys = ['linkedInAccessToken','linkedInAccessTokenExpiresAt']

        const keyvalueMap=(await Util.keyvalueMap(db, context,keys))

        const authRequest = async () => {
            const response =  (await request({
                method: 'GET',
                uri: 'https://api.linkedin.com/v1/people/~:(id,first-name,last-name,maiden-name,formatted-name,phonetic-first-name,phonetic-last-name,formatted-phonetic-name,headline,location,industry,current-share,num-connections,num-connections-capped,summary,specialties,positions,picture-url,site-standard-profile-request,api-standard-profile-request,public-profile-url,email-address)?format=json',
                headers: {
                    Authorization: `Bearer ${keyvalueMap.linkedInAccessToken}`
                },
                json: true
            }))
            console.log(response)
            return response
        }

        if( keyvalueMap.linkedInAccessToken ){

            // check if it is expired
            if( !keyvalueMap.linkedInAccessTokenExpiresAt || Math.floor(Date.now() / 1000) > keyvalueMap.linkedInAccessTokenExpiresAt ){
                //expired
                // delete all related keys
                await db.collection('KeyValue').deleteMany({createdBy: ObjectId(context.id),key:{$in:keys}})
            }else{
                return authRequest()
            }

        }

        // the linkedInCode must be either passed as a parameter or be stored as key-value for the user
        if ( !linkedInCode ){
            throw new Error('Please create a linkedin token first.')
        }


        if( !redirectUri ){
            throw new Error('Please specify a redirect uri.')
        }

        const response =  (await request({
            method: 'POST',
            uri: 'https://www.linkedin.com/oauth/v2/accessToken',
            form: {
                grant_type:'authorization_code',
                code:linkedInCode ,
                redirect_uri:redirectUri,
                client_id: LINKEDIN_CLIENT_ID,
                client_secret: LINKEDIN_SECRET
            },
            json: true
        }))

        if( response && response.access_token ){
            keyvalueMap.linkedInAccessToken = response.access_token
            if( response.id ){

            }
            console.log(response)
            Util.setKeyValues(db,context,{'linkedInAccessToken':response.access_token,'linkedInAccessTokenExpiresAt':(Math.floor(Date.now() / 1000)+response.expires_in)})
        }else{
            throw new Error('No access token received')
        }

        return authRequest()
    }
})