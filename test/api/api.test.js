import apiServer from '../../api/server'
import {graphqlQuery} from '../TestHelper'
import {speechLanguages} from '../../api/data/common'


describe('Pokemon integration', () => {
    let app

    beforeEach((done) => {
        apiServer.start((server) => {
            app = server
            done()
        })
    })

    afterEach((done) => {
        apiServer.stop(app, done)
    })

    it('Test api call speechLanguages', () => {
        const query = '{speechLanguages{data{key name}}}'

        const expected = {
            data: {speechLanguages: {data: speechLanguages}}
        }

        return graphqlQuery(app.address().port, query).then((response) => {
            expect(response.statusCode).toEqual(200)
            expect(response.body).toEqual(expected)
        })
    })

})

