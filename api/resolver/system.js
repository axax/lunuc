import Util from '../util'
import {execSync} from 'child_process'
import path from 'path'
import fs from 'fs'
import config from 'gen/config'
const {BACKUP_DIR} = config

export const systemResolver = (db) => ({
    run: async ({command}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)


        if (!command) {
            throw new Error('No command to execute.')
        }


        const options = {
            encoding: 'utf8'
        }

        const response = execSync(command, options)

        return {response}
    },
    dbDumps: async (data, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        // make sure upload dir exists
        const backup_dir = path.join(__dirname, '../../'+ BACKUP_DIR)
        if( !Util.ensureDirectoryExistence(backup_dir) ){
            throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
        }

        const files = []
        fs.readdirSync(backup_dir).forEach(file => {
            const stats = fs.statSync(backup_dir+'/'+file)
            files.push({name:file,createdAt:new Date(stats.mtime), size: (stats.size / 1000) + 'kb'})
        })

        const response = {
            results: files,
            offset: 0,
            limit: 0,
            total: files.length
        }

        return response
    },
    createDbDump: async ({type}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        // make sure upload dir exists
        const backup_dir = path.join(__dirname, '../../'+ BACKUP_DIR)
        if( !Util.ensureDirectoryExistence(backup_dir) ){
            throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
        }

        /*

         Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip

         */
        const date = Date.now(),
            name='backup.'+date+'.gz',
            fullName = path.join(backup_dir, name)

        const response = execSync('mongodump --uri $LUNUC_MONGO_URL -v --archive="'+fullName+'" --gzip')
        console.log('createDbDump',response)

        const stats = fs.statSync(fullName)

        return {name, createdAt: date, size: (stats.size / 1000) + 'kb'}
    }
})