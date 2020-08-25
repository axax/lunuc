import {useState, useEffect} from 'react'
import Util from '../util'

const location = window.location
const httpUri = `${location.protocol}//${location.hostname}:${location.port}/graphql`

const cache = {}


const getHeaders  = ()=>{
    const headers = {
        'Content-Language': _app_.lang,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }

    const token = Util.getAuthToken()
    if (token) {
        headers['Authorization'] = token
    }
    if (_app_.session) {
        headers['x-session'] = _app_.session
    }

    return headers
}

export const client = {}

export const useQuery = ({query, variables, fetchPolicy}) => {
    const [response, setResponse] = useState({loading: true, data: null})


    const cacheKey = query

    if( fetchPolicy !== 'network-only'){
        response.data = cache[cacheKey]
    }


    useEffect(() => {



        fetch(httpUri, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({query, variables})
        }).then(r => {
            r.json().then((data)=>{

                setResponse({loading: false, data})
                cache[cacheKey] = data

            })
            //r.json()
        })


        /*function handleStatusChange(status) {
            setIsOnline(status.isOnline);
        }*/
    }, [])

    return response
}
