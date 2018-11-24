import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'

const cronjobUtil = {
    runScript: async (props) => {

        const {cronjobId, script, context, db} = props

        const dbResult = await GenericResolver.createEnity(db, context, 'CronJobExecution', {
            state: 'running',
            cronjob: ObjectId(cronjobId)
        })

        const tpl = new Function(`
        const _this = this;
        const require = this.require;
        (async () => {
            var oldLog = console.log;
            console.log = (msg) => {
                _this.log(msg);
                oldLog.apply(console, arguments);
            };
            ${script}
            _this.end();
        })();`)

        let scriptLog = ''
        const log = (msg) => {
            scriptLog += msg
        }

        const end = () => {
            GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                _id: dbResult._id,
                state: 'finished',
                endTime: (new Date()).getTime(),
                scriptLog
            })
        }

        const result = tpl.call({require, log, end, ...props})


        return dbResult._id;
    }
}

export default cronjobUtil