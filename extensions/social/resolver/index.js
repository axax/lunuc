import Util from 'api/util/index.mjs'
import request from '../../../api/util/request'
import {ObjectId} from 'mongodb'


const LINKEDIN_CLIENT_ID = '772exdl15hhf0d'

// this is sensitive - never expose the secret publicly
const LINKEDIN_SECRET = ''


//https://www.linkedin.com/psettings/member-data
export default (db) => ({
    Query: {
        linkedin: async ({redirectUri, linkedInCode}, {context}) => {
            const userIsLoggedIn = Util.isUserLoggedIn(context)

            const keys = ['linkedInAccessToken', 'linkedInAccessTokenExpiresAt']

            const keyvalueMap = (await Util.keyvalueMap(db, context, keys))

            const authRequest = async () => {

                try {

                    const response = (await request({
                        method: 'GET',
                        url: 'https://api.linkedin.com/v2/me/?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))', //?projection=(ID,localizedFirstName,localizedLastName,localizedHeadline,firstName,lastName,profilePicture,headline,vanityName)', //'/~:(id,first-name,last-name,maiden-name,formatted-name,phonetic-first-name,phonetic-last-name,formatted-phonetic-name,headline,location,industry,current-share,num-connections,num-connections-capped,summary,specialties,positions,picture-url,site-standard-profile-request,api-standard-profile-request,public-profile-url,email-address)?format=json',
                        headers: {
                            'X-RestLi-Protocol-Version': '2.0.0',
                            Authorization: `Bearer ${keyvalueMap.linkedInAccessToken}`
                        },
                        json: true
                    }))

                    return {
                        pictureUrl: response.profilePicture['displayImage~'].elements[1].identifiers[0].identifier,
                        headline: response.localizedFirstName + ' ' + response.localizedLastName,
                        firstName: response.localizedFirstName,
                        lastName: response.localizedLastName
                    }
                } catch (e) {
                    console.error(e)
                    return false
                }

            }

            if (keyvalueMap.linkedInAccessToken) {

                // check if it is expired
                if (!keyvalueMap.linkedInAccessTokenExpiresAt || Math.floor(Date.now() / 1000) > keyvalueMap.linkedInAccessTokenExpiresAt) {
                    //expired
                    // delete all related keys
                    await db.collection('KeyValue').deleteMany({createdBy: ObjectId(context.id), key: {$in: keys}})
                } else {
                    const response = authRequest()
                    if( !response){
                        // there is something wrong. Remove stored values in order to renew the token
                        await db.collection('KeyValue').deleteMany({createdBy: ObjectId(context.id), key: {$in: keys}})
                    }
                }

            }

            // the linkedInCode must be either passed as a parameter or be stored as key-value for the user
            if (!linkedInCode) {
                throw new Error('Please create a linkedin token first.')
            }


            if (!redirectUri) {
                throw new Error('Please specify a redirect uri.')
            }

            const response = (await request({
                method: 'POST',
                url: 'https://www.linkedin.com/oauth/v2/accessToken',
                form: {
                    grant_type: 'authorization_code',
                    code: linkedInCode,
                    redirect_uri: redirectUri,
                    client_id: LINKEDIN_CLIENT_ID,
                    client_secret: LINKEDIN_SECRET
                },
                json: true
            }))

            if (response && response.access_token) {
                keyvalueMap.linkedInAccessToken = response.access_token
                if (response.id) {

                }
                Util.setKeyValues(db, context, {
                    'linkedInAccessToken': response.access_token,
                    'linkedInAccessTokenExpiresAt': (Math.floor(Date.now() / 1000) + response.expires_in)
                })
            } else {
                throw new Error('No access token received')
            }

            return authRequest()
        }
    }
})
