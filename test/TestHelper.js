import request from 'request-promise'


export const graphqlQuery = (port, query) => request({
        baseUrl : `http://localhost:${port}`,
        uri : '/graphql',
        qs : {
            query
        },
        resolveWithFullResponse: true,
        json: true
    })