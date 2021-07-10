import request from '../api/util/request'



export const graphqlQuery = (port, query) => request({
        baseUrl : `http://localhost:${port}`,
        uri : '/graphql',
        qs : {
            query
        },
        resolveWithFullResponse: true,
        json: true
    })
