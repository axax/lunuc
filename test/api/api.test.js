import apiServer from '../../api/server'
import {graphqlQuery} from '../TestHelper'
import {speechLanguages} from '../../api/data/common'


describe('Api integration', () => {
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



    it('Test api call translate', () => {
        const query = '{translate(text: "Hallo meine liebe Frau", toIso: "en"){text fromIso toIso }}'

        const expected = {
            'data': {
                'translate': {
                    'text': 'Hello my dear wife',
                    'fromIso': 'de',
                    'toIso': 'en'
                }
            }
        }

        return graphqlQuery(app.address().port, query).then((response) => {
            expect(response.statusCode).toEqual(200)
            expect(response.body).toEqual(expected)
        })
    })

})

