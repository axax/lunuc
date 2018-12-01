import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import Util from 'api/util'

const cronjobUtil = {
    runScript: async (props) => {

        const {cronjobId, script, context, db} = props

        const dbResult = await GenericResolver.createEnity(db, context, 'CronJobExecution', {
            state: 'running',
            cronjob: ObjectId(cronjobId)
        })

        const tpl = new Function(`
        const require = this.require;
        const start = (async () => {
            try {
            
            ${script}
            
            } catch(e) {
                this.error(e);
            }
            this.end();
        })();
        `)

        let scriptLog = ''
        const log = (msg) => {
            scriptLog += msg
        }

        const error = (e) => {
            GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                _id: dbResult._id,
                state: 'error',
                endTime: (new Date()).getTime(),
                scriptLog: e.message
            })
        }

        const end = () => {
            GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                _id: dbResult._id,
                state: 'finished',
                endTime: (new Date()).getTime(),
                scriptLog
            })
        }

        const select = async (collection, fields, filter) => {
            await GenericResolver.entities(db, context, collection, fields, filter)
        }

        const result = tpl.call({require, log, end, error, select, ...props})

        return dbResult._id;
    },
    execFilter: (filter) => {
        return Util.matchFilterExpression(filter, Util.systemProperties() )
    }
}

export default cronjobUtil